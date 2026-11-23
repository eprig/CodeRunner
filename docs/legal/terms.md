---
sidebar_position: 2
title: Terms of Service
---

# Terms of Service

**Last updated: September 2, 2026**

These terms cover the CodeRunner software and any instance of it you use. By signing in to a
CodeRunner instance, you agree to them.

## 1. What CodeRunner is

CodeRunner is open-source software for teaching FRC robot programming: a browser-based Java
editor, a per-student workspace, a simulator, telemetry, and a path-planning tool. It is
self-hosted — schools and robotics teams install it and run it on their own hardware.

The organization running your instance sets its own rules for use, decides who may sign in,
and controls the server. **Their rules apply in addition to these terms.** Where the two
conflict for that instance, theirs govern.

## 2. Who may use it

CodeRunner is intended for educational use by FRC teams and similar programs. Many users are
minors; they use it under the supervision of the school or robotics program operating the
instance. You may only sign in to an instance you have been granted access to — access is
controlled by the roster and domain rules the operator maintains.

## 3. Acceptable use

Use CodeRunner for learning and building robot code. Do not:

- attempt to escape your workspace container, reach other students' workspaces or data, or
  gain administrative access you were not granted
- attack, probe, or disrupt the host machine or its network
- use your workspace for cryptocurrency mining, hosting unrelated services, distributed
  computing, or anything else that consumes shared compute at other students' expense
- run deliberately abusive workloads intended to exhaust CPU, memory, or disk
- upload, run, or distribute malware, or content that is illegal or that violates the
  operator's policies
- share your account credentials, or sign in as someone else

Workspaces run with resource limits. Working around them is a violation of these terms.

## 4. Your code

**You own what you write.** Nothing in these terms transfers ownership of your code to the
CodeRunner project or, by default, to your instance's operator. Your school or team may have
its own policies about work produced in its programs.

The CodeRunner software itself is licensed under the MIT License, and the lesson content and
starter projects it ships carry their own licenses. See [Licenses](./licenses.md).

## 5. Your data can be discarded — use Git

Some ordinary actions **intentionally and permanently replace the contents of your
workspace**:

- switching to a different lesson module
- resetting your current lesson
- importing a GitHub repository

There is no server-side undo and no per-action backup. This is by design. **Commit and push
work you want to keep.** Team projects imported from GitHub keep their `.git` directory
precisely so Git can serve as the safety net.

Administrators may also delete workspaces, and instances may be shut down or rebuilt.

## 6. Availability

CodeRunner instances are typically run on modest hardware by volunteers. There is no uptime
guarantee, no service level commitment, and no promise that your workspace will still exist
tomorrow. Instances may go down for maintenance, at the end of a season, or permanently.

## 7. Termination

Your instance's operator may suspend or remove your access at any time, including for
violating these terms or their own policies. You may stop using CodeRunner at any time and
ask your administrator to delete your account and workspace.

## 8. No warranty

CodeRunner is provided **"as is," without warranty of any kind**, express or implied,
including but not limited to the warranties of merchantability, fitness for a particular
purpose, and noninfringement. This mirrors the disclaimer in the
[MIT License](https://github.com/mathewdunne/CodeRunner/blob/main/LICENSE) the software is
released under.

The simulator approximates robot behavior for teaching purposes. **Do not rely on it as
proof that code is safe to run on physical hardware.** Always follow FIRST safety rules and
test on a real robot under proper supervision.

## 9. Limitation of liability

To the maximum extent permitted by law, the CodeRunner authors and copyright holders are not
liable for any claim, damages, or other liability — including lost work, lost data, or
interrupted use — arising from the software or its use, whether in contract, tort, or
otherwise.

The maintainers do not operate your instance and are not responsible for how an operator runs
it or for the data on it.

## 10. Third-party software

CodeRunner bundles third-party software, including AdvantageScope, PathPlanner, VSCodium,
WPILib, and the Java toolchain, each under its own license. Your use of those components is subject to
their terms. See [Licenses](./licenses.md). None of those projects endorse or are affiliated
with CodeRunner.

## 11. Changes to these terms

Changes will be posted here with an updated date above. The full revision history is public in
the
[project repository](https://github.com/mathewdunne/CodeRunner/commits/main/docs/legal/terms.md).
Continuing to use CodeRunner after a change means you accept the revised terms.

## 12. Governing law

These terms are governed by the laws of the Province of Ontario, Canada, and the federal laws
of Canada applicable there, without regard to conflict-of-law rules. This does not deprive you
of protections under the mandatory law of your own place of residence.

## 13. Contact

Questions about these terms or the software: open an issue at
[github.com/mathewdunne/CodeRunner/issues](https://github.com/mathewdunne/CodeRunner/issues).

Questions about a specific installation: contact the school, team, or mentor operating it.
