import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { placePopover, RefPicker } from "./RefPicker";

const rect = (top: number, height = 38) =>
	({ top, bottom: top + height, left: 100, width: 400 }) as DOMRect;

describe("RefPicker", () => {
	test("renders its dropdown outside clipping ancestors", async () => {
		const user = userEvent.setup();
		render(
			<div style={{ overflow: "hidden" }} data-testid="clipping-card">
				<RefPicker
					tags={["v2.5.0"]}
					branches={Array.from({ length: 40 }, (_, i) => `branch-${i}`)}
					commits={{}}
					currentKey={null}
					value={null}
					onChange={vi.fn()}
				/>
			</div>,
		);
		await user.click(screen.getByTestId("update-ref-picker"));
		const popover = screen.getByTestId("update-ref-popover");
		expect(screen.getByTestId("clipping-card")).not.toContainElement(popover);
		expect(popover.style.position).toBe("fixed");
		const list = screen.getByRole("listbox");
		expect(list.className).toContain("overflow-y-auto");
		expect(list.style.maxHeight).not.toBe("");
	});

	test("opens below the trigger when there is room", () => {
		vi.stubGlobal("innerHeight", 900);
		const placement = placePopover(rect(100));
		expect(placement.style.top).toBe(142);
		expect(placement.style.bottom).toBeUndefined();
		expect(placement.listMaxHeight).toBe(288);
		vi.unstubAllGlobals();
	});

	test("flips above the trigger near the bottom of the window and fits the list", () => {
		vi.stubGlobal("innerHeight", 700);
		const placement = placePopover(rect(600));
		expect(placement.style.top).toBeUndefined();
		expect(placement.style.bottom).toBe(104);
		expect(placement.listMaxHeight).toBe(288);
		vi.unstubAllGlobals();
	});

	test("shrinks the list to the space available so it still scrolls on screen", () => {
		vi.stubGlobal("innerHeight", 400);
		const placement = placePopover(rect(150));
		// 400 - 188 - 8 - 4 = 200 below; 200 - 41 search row = 159.
		expect(placement.listMaxHeight).toBe(159);
		vi.unstubAllGlobals();
	});
});
