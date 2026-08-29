# Security policy

## Supported versions

The current minor release and the previous minor release are supported.

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

A security issue may require dropping the previous minor. Repository versions
and tags stay immutable; stores may allow a rollback operationally.

## Reporting a vulnerability

Report privately through
[GitHub security advisories](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories)
on this repository. Do not file a public issue for unreleased vulnerabilities.

Please include:

- affected version or commit
- impact (for example unintended activation, secret exposure, or supply-chain)
- reproduction that does not require private repository data

We will acknowledge the report, assess severity against
[docs/threat-model.md](docs/threat-model.md), and coordinate a fix-forward
release when a package change is required.
