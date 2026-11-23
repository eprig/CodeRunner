/**
 * Admin allowlist management: people are roster rows in Better Auth's `user`
 * table; only email domains remain in allowlist.json.
 */
import type { ControlApp } from "../../../apps/control/src/app/types";
import { expect, test } from "../../fixtures/app";
import { cookieHeader, loginAs } from "../../fixtures/auth";

type RosterUser = {
	id: string;
	email: string;
	username: string | null;
	pending: boolean;
};

type AllowlistBody = {
	ok: boolean;
	users: RosterUser[];
	domains: string[];
	user?: RosterUser;
	temporaryPassword?: string;
};

async function postAllowlist(
	app: ControlApp,
	cookie: string,
	body: unknown,
): Promise<{ status: number; body: AllowlistBody }> {
	const response = await app.fetch(
		new Request(`${app.storage.config.baseUrl}/admin/allowlist`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie,
			},
			body: JSON.stringify(body),
		}),
	);
	return {
		status: response.status,
		body: (await response.json()) as AllowlistBody,
	};
}

test("admin scaffolds a pending roster user and can reuse that row", async ({
	page,
	app,
}) => {
	const admin = await loginAs(page, app, { name: "Admin", role: "admin" });
	const cookie = cookieHeader(admin);

	const added = await postAllowlist(app, cookie, {
		username: "newkid",
		displayName: "New Kid",
	});
	expect([200, 201]).toContain(added.status);
	expect(added.body.user?.username).toBe("newkid");
	expect(added.body.user?.email).toBe("newkid@students.coderunner.invalid");
	expect(added.body.user?.pending).toBe(true);
	expect(added.body.temporaryPassword).toBeTruthy();

	// Repeating the add reuses the user; no duplicate row/workspace is created.
	const again = await postAllowlist(app, cookie, {
		username: "newkid",
		email: "newkid@team.test",
	});
	expect(again.status).toBe(200);
	expect(again.body.user?.id).toBe(added.body.user?.id);
	expect(again.body.user?.email).toBe("newkid@team.test");
	const userCount = app.storage.db
		.query("SELECT COUNT(*) AS count FROM user WHERE username = ?")
		.get("newkid") as { count: number };
	expect(userCount.count).toBe(1);

	const list = await app.fetch(
		new Request(`${app.storage.config.baseUrl}/admin/allowlist`, {
			headers: { cookie },
		}),
	);
	expect(list.status).toBe(200);
	const body = (await list.json()) as AllowlistBody;
	expect(body.users.some((u) => u.id === added.body.user?.id)).toBe(true);
	expect(body.domains).toEqual([]);
});

test("admin can generate, reveal, and edit the required temporary password", async ({
	page,
	app,
}) => {
	await loginAs(page, app, { name: "Coach", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();
	await page.getByRole("button", { name: "Add user", exact: true }).click();

	const create = page.getByRole("button", { name: "Create user" });
	const passwordInput = page.getByTestId("admin-temporary-password-input");
	await expect(create).toBeDisabled();
	await page.getByTestId("admin-allowlist-input").fill("generated");
	await expect(create).toBeDisabled();

	await page.getByRole("button", { name: "Generate" }).click();
	const generated = await passwordInput.inputValue();
	expect(generated.length).toBeGreaterThanOrEqual(8);
	await expect(create).toBeEnabled();

	await expect(passwordInput).toHaveAttribute("type", "password");
	await page.getByRole("button", { name: "Show password" }).click();
	await expect(passwordInput).toHaveAttribute("type", "text");
	await expect(passwordInput).toHaveValue(generated);
	await passwordInput.fill("coach chosen password");
	await expect(passwordInput).toHaveValue("coach chosen password");
	await page.getByRole("button", { name: "Hide password" }).click();
	await expect(passwordInput).toHaveAttribute("type", "password");

	await create.click();
	await expect(
		page.getByText("Temporary password for generated"),
	).toBeVisible();
	await expect(page.getByTestId("admin-temporary-password")).toHaveText(
		"coach chosen password",
	);
});

test("admin edits a user from the Users sheet and cannot re-add them", async ({
	page,
	app,
}) => {
	await loginAs(page, app, { name: "Coach", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();

	await page.getByRole("button", { name: "Add user", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Create user" }),
	).toBeDisabled();
	await page.getByTestId("admin-allowlist-input").fill("student");
	await page.getByRole("button", { name: "Generate" }).click();
	await page.getByRole("button", { name: "Create user" }).click();
	await expect(page.getByText("Temporary password for student")).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();

	await page.getByRole("button", { name: "Actions for student" }).click();
	await page.getByRole("menuitem", { name: "Edit" }).click();
	await page.getByTestId("admin-edit-username").fill("");
	await page.getByTestId("admin-edit-email").fill("");
	await expect(
		page.getByRole("button", { name: "Save changes" }),
	).toBeDisabled();
	await page.getByTestId("admin-edit-display-name").fill("Renamed Student");
	await page.getByTestId("admin-edit-username").fill("renamed");
	await page.getByTestId("admin-edit-email").fill("student@team.test");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(
		page.getByRole("row", { name: /Renamed Student/u }),
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: "renamed", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: "student@team.test" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Add user", exact: true }).click();
	await page.getByTestId("admin-allowlist-input").fill("renamed");
	await page.getByRole("button", { name: "Generate" }).click();
	await page.getByRole("button", { name: "Create user" }).click();
	await expect(page.getByText("already belongs to a user")).toBeVisible();
});

test("admin manages allowed domains from the top-level Domains sheet", async ({
	page,
	app,
}) => {
	await loginAs(page, app, { name: "Coach", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();

	await page.getByRole("button", { name: "Domains" }).click();
	await page.getByTestId("admin-domain-input").fill("team.test");
	await page.getByRole("button", { name: "Add domain" }).click();
	await expect(page.getByText("team.test")).toBeVisible();

	await page.getByRole("button", { name: "Remove team.test" }).click();
	await expect(page.getByText("team.test")).toHaveCount(0);
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByText("Allowed email domains")).toHaveCount(0);
});

test("admin password reset marks an established user without calling them pending", async ({
	page,
	app,
}) => {
	await loginAs(page, app, {
		name: "Student",
		email: "student@team.test",
	});
	await page.context().clearCookies();
	await loginAs(page, app, { name: "Coach", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();

	page.once("dialog", (dialog) => void dialog.accept());
	await page.getByRole("button", { name: "Actions for Student" }).click();
	await page.getByRole("menuitem", { name: "Reset password" }).click();
	await expect(page.getByText("Temporary password for Student")).toBeVisible();
	await page.getByRole("button", { name: "Done" }).click();

	const row = page.getByRole("row", { name: /Student/u });
	await expect(row.getByText("Password reset")).toBeVisible();
	await expect(row.getByText("Pending")).toHaveCount(0);
});

test("admin removes a pending roster row by id and manages domains separately", async ({
	page,
	app,
}) => {
	const admin = await loginAs(page, app, { name: "Admin", role: "admin" });
	const cookie = cookieHeader(admin);

	const added = await postAllowlist(app, cookie, { email: "kid@team.test" });
	const userId = added.body.user!.id;

	const removed = await app.fetch(
		new Request(
			`${app.storage.config.baseUrl}/admin/allowlist/${encodeURIComponent(userId)}?kind=user`,
			{ method: "DELETE", headers: { cookie } },
		),
	);
	expect(removed.status).toBe(200);
	const afterRemove = (await removed.json()) as AllowlistBody;
	expect(afterRemove.users.some((u) => u.id === userId)).toBe(false);

	const domain = await postAllowlist(app, cookie, {
		kind: "domain",
		value: "team.test",
	});
	expect(domain.status).toBe(200);
	expect(domain.body.domains).toContain("team.test");
});
