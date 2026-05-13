## MODIFIED Requirements

### Requirement: User search and role filter

The Users tab MUST render a search input that filters the visible users by case-insensitive substring match on `name`, `fullName`, `email`, or `_id`. It MUST also render a role filter accepting one of `{ all, operator, admin }`. The role filter MUST NOT offer `approver` or `service` options.

#### Scenario: search filters by name

- **GIVEN** the search box contains `maria`
- **WHEN** the users table renders
- **THEN** only users whose `name` or `fullName` matches `/maria/i` are shown

#### Scenario: role filter narrows to admins

- **GIVEN** the role filter is set to `admin`
- **WHEN** the table renders
- **THEN** only users with `role === 'admin'` are shown

#### Scenario: role filter has no approver or service options

- **WHEN** the role filter dropdown is opened
- **THEN** the available options are exactly `{ all, operator, admin }`
- **AND** no `approver` or `service` option appears
