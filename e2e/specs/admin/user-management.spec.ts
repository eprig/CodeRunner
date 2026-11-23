/**
 * T31.1 — admin user-management actions (read-only path).
 *
 * T32.1 / T32.2 (cannot-demote-last-admin, delete-removes-workspace) were
 * dropped from scope: the corresponding HTTP endpoints don't exist yet and
 * storage-layer invariants are the only enforcement today.
 */
import { expect, test } from "../../fixtures/app";
import { cookieHeader, loginAs } from "../../fixtures/auth";

test("admin GET /admin/users returns the user list", async ({ page, app }) => {
	const admin = await loginAs(page, app, { name: "Admin", role: "admin" });
	const resp = await app.fetch(
		new Request(`${app.storage.config.baseUrl}/admin/users`, {
			headers: { cookie: cookieHeader(admin) },
		}),
	);
	expect(resp.status).toBe(200);
});

test("admin cannot edit their own user through user management", async ({
	page,
	app,
}) => {
	const admin = await loginAs(page, app, {
		name: "Admin",
		email: "admin@team.test",
		role: "admin",
	});
	const cookie = cookieHeader(admin);
	const id = encodeURIComponent(admin.user.id);
	const post = (path: string, body: unknown = {}) =>
		app.fetch(
			new Request(`${app.storage.config.baseUrl}${path}`, {
				method: "POST",
				headers: {
					cookie,
					"content-type": "application/json",
				},
				body: JSON.stringify(body),
			}),
		);

	for (const path of [
		`/admin/users/${id}/reset-password`,
		`/admin/users/${id}/identity`,
		`/admin/users/${id}/demote`,
	]) {
		expect((await post(path, { username: "someoneelse" })).status).toBe(409);
	}
	const allowlistPost = await post("/admin/allowlist", {
		email: admin.user.email,
		username: "someoneelse",
	});
	expect(allowlistPost.status).toBe(409);

	expect(
		(
			await app.fetch(
				new Request(`${app.storage.config.baseUrl}/admin/users/${id}`, {
					method: "DELETE",
					headers: { cookie },
				}),
			)
		).status,
	).toBe(409);
	expect(
		(
			await app.fetch(
				new Request(
					`${app.storage.config.baseUrl}/admin/allowlist/${encodeURIComponent(admin.user.email)}?kind=email`,
					{ method: "DELETE", headers: { cookie } },
				),
			)
		).status,
	).toBe(409);
});

test("admin Users table marks the signed-in admin and hides their actions", async ({
	page,
	app,
}) => {
	await loginAs(page, app, { name: "Admin", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();

	const row = page
		.getByTestId("admin-users-table")
		.locator("tr")
		.filter({ hasText: "Admin" });
	await expect(row.getByText("Admin", { exact: true })).toBeVisible();
	await expect(row.getByText("You", { exact: true })).toHaveCount(0);
	await expect(
		row.getByRole("button", { name: "Actions for Admin" }),
	).toHaveCount(0);
});
