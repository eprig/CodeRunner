/**
 * End-to-end roster flow: a coach adds a student in the admin UI, the student
 * signs in with the one-time password, is forced to rotate it, and lands on
 * the account page with one user and one workspace.
 */
import { expect, test } from "../../fixtures/app";
import { loginAs } from "../../fixtures/auth";

test("pending student rotates a temporary password and sees a read-only account", async ({
	page,
	app,
}) => {
	await loginAs(page, app, { name: "Coach", role: "admin" });
	await page.goto(`${app.storage.config.baseUrl}/admin/`);
	await page.getByRole("button", { name: "Users", exact: true }).click();
	await page.getByRole("button", { name: "Add user", exact: true }).click();
	await page.getByTestId("admin-allowlist-input").fill("student");
	await page.getByRole("button", { name: "Generate" }).click();
	await page.getByRole("button", { name: "Create user" }).click();

	await expect(page.getByText("Temporary password for student")).toBeVisible();
	const temporaryPassword = await page
		.getByTestId("admin-temporary-password")
		.textContent();
	expect(temporaryPassword?.trim().length).toBeGreaterThanOrEqual(8);
	await expect(page.getByText("Pending").first()).toBeVisible();

	// Start a clean browser for the student.
	await page.context().clearCookies();
	await page.goto(`${app.storage.config.baseUrl}/login`);
	await page.getByLabel("Username or email").fill("student");
	await page.getByLabel("Password").fill(temporaryPassword!.trim());
	await page.getByRole("button", { name: "Sign in" }).click();

	await expect(page).toHaveURL(/\/account$/u);
	await expect(
		page.getByText("Your coach gave you a temporary password."),
	).toBeVisible();

	// The gate keeps the workspace closed until the password rotates.
	const blocked = await page.goto(`${app.storage.config.baseUrl}/`);
	expect(blocked?.status()).toBe(200);
	await expect(page).toHaveURL(/\/account$/u);

	const newPassword = "a brand new password";
	await expect(page.getByPlaceholder("Current password")).toHaveCount(0);
	await page.getByPlaceholder("New password (8+ characters)").fill(newPassword);
	await page.getByPlaceholder("Confirm new password").fill(newPassword);
	await page.getByRole("button", { name: "Set new password" }).click();
	await expect(page).toHaveURL(/\/u\/student\/$/u);

	// Email is roster-owned and read-only on the account page.
	await page.goto(`${app.storage.config.baseUrl}/account`);
	await expect(page.getByTestId("account-email")).toHaveText("—");
	await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

	const userCount = app.storage.db
		.query("SELECT COUNT(*) AS count FROM user WHERE username = ?")
		.get("student") as { count: number };
	const workspaceCount = app.storage.db
		.query("SELECT COUNT(*) AS count FROM workspaces WHERE slug = ?")
		.get("student") as { count: number };
	expect(userCount.count).toBe(1);
	expect(workspaceCount.count).toBe(1);

	// The rotated password still signs in to the same workspace.
	await page.context().clearCookies();
	await page.goto(`${app.storage.config.baseUrl}/login`);
	await page.getByLabel("Username or email").fill("student");
	await page.getByLabel("Password").fill(newPassword);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page).toHaveURL(/\/u\/student\/$/u);
});

test("account page keeps the read-only email inside the Google connection", async ({
	page,
	app,
}) => {
	app.storage.config.googleClientId = "test-client";
	app.storage.config.googleClientSecret = "test-secret";
	await loginAs(page, app, { name: "Student", email: "student@team.test" });
	await page.goto(`${app.storage.config.baseUrl}/account`);

	const googleCard = page
		.getByText("Google", { exact: true })
		.locator('xpath=ancestor::div[contains(@class, "rounded-md")][1]');
	await expect(googleCard.getByTestId("account-email")).toHaveText(
		"student@team.test",
	);
});

test("a coach password reset can be replaced after signing in with Google", async ({
	page,
	app,
}) => {
	const { user } = await loginAs(page, app, {
		name: "Student",
		email: "student@team.test",
	});
	const now = new Date().toISOString();
	app.storage.db
		.query("UPDATE user SET username = ?, mustChangePassword = 1 WHERE id = ?")
		.run("student", user.id);
	// A Google-linked row whose coach just reset the credential password.
	app.storage.db
		.query(
			"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run("acctGoogleReset", "google-123", "google", user.id, now, now);
	app.storage.db
		.query(
			"INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
		.run(
			"acctCredentialReset",
			user.id,
			"credential",
			user.id,
			"old:salt:hash",
			now,
			now,
		);

	await page.goto(`${app.storage.config.baseUrl}/`);
	await expect(page).toHaveURL(/\/account$/u);
	await expect(page.getByPlaceholder("Current password")).toHaveCount(0);
	await expect(page.getByText("You're already signed in.")).toBeVisible();

	const newPassword = "chosen after google sign-in";
	await page.getByPlaceholder("New password (8+ characters)").fill(newPassword);
	await page.getByPlaceholder("Confirm new password").fill(newPassword);
	await page.getByRole("button", { name: "Set new password" }).click();
	await expect(page).toHaveURL(/\/u\/student\/$/u);

	const row = app.storage.db
		.query(
			"SELECT u.mustChangePassword, a.password FROM user u JOIN account a ON a.userId = u.id AND a.providerId = 'credential' WHERE u.id = ?",
		)
		.get(user.id) as { mustChangePassword: number; password: string };
	expect(row.mustChangePassword).toBe(0);
	expect(row.password).not.toBe("old:salt:hash");
});

test("username and password are added in one form and changed in the same card", async ({
	page,
	app,
}) => {
	const { user } = await loginAs(page, app, {
		name: "Student",
		email: "combined@test.local",
	});
	await page.goto(`${app.storage.config.baseUrl}/account`);

	await expect(page.getByPlaceholder("Add a username")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Change password" }),
	).toHaveCount(0);
	await page.getByPlaceholder("Username").fill("combined");
	await page
		.getByPlaceholder("Password (8+ characters)")
		.fill("first password");
	await page.getByRole("button", { name: "Add username & password" }).click();
	await expect(page.getByText("Username and password added")).toBeVisible();

	const credential = app.storage.db
		.query(
			"SELECT a.password, u.username FROM account a JOIN user u ON u.id = a.userId WHERE a.userId = ? AND a.providerId = 'credential'",
		)
		.get(user.id) as { password: string; username: string } | null;
	expect(credential?.username).toBe("combined");
	expect(credential?.password).toBeTruthy();

	await page.getByRole("button", { name: "Change password" }).click();
	await page.getByPlaceholder("Current password").fill("first password");
	await page
		.getByPlaceholder("New password (8+ characters)")
		.fill("second password");
	await page.getByRole("button", { name: "Update password" }).click();
	await expect(page).toHaveURL(/\/u\/student\/$/u);
});

test("removing a sign-in method has no confirmation popup", async ({
	page,
	app,
}) => {
	app.storage.config.googleClientId = "test-client";
	app.storage.config.googleClientSecret = "test-secret";
	const { user } = await loginAs(page, app, {
		name: "Student",
		email: "student@team.test",
	});
	await page.goto(`${app.storage.config.baseUrl}/account`);
	await page.getByPlaceholder("Username").fill("student");
	await page
		.getByPlaceholder("Password (8+ characters)")
		.fill("start password");
	await page.getByRole("button", { name: "Add username & password" }).click();
	await expect(page.getByText("Username and password added")).toBeVisible();

	const now = new Date().toISOString();
	app.storage.db
		.query(
			"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run("acctGoogleNoConfirm", "google-123", "google", user.id, now, now);
	await page.reload();

	await page
		.getByRole("button", { name: "Remove username & password" })
		.click();
	await expect(page.getByText("Username and password removed.")).toBeVisible();
	const remaining = app.storage.db
		.query(
			"SELECT providerId FROM account WHERE userId = ? ORDER BY providerId",
		)
		.all(user.id) as Array<{ providerId: string }>;
	expect(remaining.map((account) => account.providerId)).toEqual(["google"]);
});
