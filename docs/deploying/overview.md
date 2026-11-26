---
sidebar_position: 1
title: Deployment Overview
---

# Deployment Overview

CodeRunner is self-hosted. You run the control plane and the per-student
workspace containers on a machine you control; there is no managed SaaS.

:::tip[Recommended for new deployments]

Start with [Local Deployment](./local.md). It is the simplest setup and works
well for most teams running CodeRunner in a classroom or at team meetings.

:::

## Choose a deployment route

### Local Deployment (recommended)

Run CodeRunner on a lab PC, spare laptop, or mini PC. Students connect over the
same trusted local network. Setup is a small `.env` file followed by
`docker compose up`.

See [Local Deployment](./local.md).

### Google Cloud Deployment (advanced)

Use the Terraform-based Google Cloud setup when students need remote access at
a stable public URL. It provisions a VM, HTTPS, automated releases, monitoring,
and persistent storage. This route requires a domain, a GCP project with
billing, and more infrastructure experience.

You can stop the VM between seasons; see
[Seasonal Teardown](../operating/seasonal-teardown.md).

See [Google Cloud Deployment](./gcloud.md).

## What both need

Regardless of shape, every non-demo deployment needs:

- **A sign-in method.** Login is via GitHub, Google, and/or Auth0 through Better
  Auth, with coach-provisioned username/password as an optional alternative; at
  least one method must be configured. Register your apps first; see
  [OAuth Credentials](./oauth-credentials.md).
- **Docker.** Each active student runs in a per-student workspace container
  (sim + editor), so the host needs a working Docker Engine.

## Cloudflare Offline Page (advanced, optional)

Google Cloud deployments can optionally add a Cloudflare Pages layer so
students see a styled offline screen while the VM is powered down. This is not
needed for local deployments. See [Cloudflare Offline Page](./cloudflare.md).
