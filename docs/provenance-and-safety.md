# Provenance and publication safety

Wireline Operations Console is a modern clean-room reimplementation of a wireline acquisition and monitoring system originally designed, implemented, and field-tested by **Julia Rakitina in 2015–2016**. The supplied legacy code was authored by Julia and was used as behavioral and architectural reference. The new product is implemented in TypeScript and uses deterministic synthetic telemetry only.

Julia's original product scope included operator-interface localization for English, Russian, and Azerbaijani. The archives contain translation catalogs and runtime language selection with a saved preference. This historical capability is credited in the portfolio; the current demo has an English interface and ships no legacy catalogs.

According to Julia's supplied history, the foundational architecture later evolved to LabJack-based acquisition and modern tablet software and was commercialized in 2026. This credits the original architecture and field-tested implementation. It does not claim that Julia personally authored every later rewrite. The modern portfolio simulator is not connected to operating equipment.

## Handling the reference material

- The four supplied archives were inventoried and selected authored components inspected read-only, directly from archive readers. No archive was copied or extracted wholesale into this repository.
- No private keys, credentials, node keys, connection configuration, databases, real LAS measurements, customer/site identifiers, or machine-specific paths are part of the product.
- Legacy source, vendor directories, production constants, and historical datasets are not shipped. Behavioral findings are summarized in [the behavior map](legacy-behavior-map.md), without source passages or sensitive matches.
- All run data, survey stations, scenarios, screenshots, and export examples must originate from the new synthetic simulator. Historical recordings are never test fixtures.
- The public [visualization article](https://dev.to/julia_rakitina/the-chart-that-had-to-grow-downward-20h3) provides design context; it does not establish authorship of later software.

## Physical and historical limits

The original Arduino acquisition layer could miss encoder pulses at high input rates. Julia reports that this was identified during end-to-end field operation; it was an acquisition limitation, not evidence that the overall depth/tension architecture was invalid. The modern **Encoder degradation** scenario makes uncertain depth visible and shows an explicit marker reference correction. It does not model every hardware failure or reproduce proprietary field algorithms.

Inclination/deviation and azimuth are a clearly labeled synthetic/prototype extension. The historical work included visualization and planning, but the inclinometer did not achieve the same field-complete integration as the core depth/tension system.

This is educational portfolio software. Its thresholds, scenario physics, and correction model are illustrative; it is not certified field-control software and must not be used to control a logging unit or make operational safety decisions.

## Release boundary

Publication requires Julia's review. No deployment, remote push, customer information, or production integration is needed for this local build. No open-source license is granted by this repository; adding a license requires Julia's explicit approval.

Before any release, scan both the working tree and the intended Git history for secrets, private-key markers, credentials, personal/machine paths, database files, archives, raw legacy code, field datasets, and unintended names. Julia's public attribution is intentional. Use counts and file paths for audit findings; never place secret values in scan reports or logs. Review the actual tracked file list, screenshots, exported fixtures, and dependency metadata as well as source files.
