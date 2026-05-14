## ADDED Requirements

### Requirement: App.tsx threads setToast to all admin create pages

`App.tsx` MUST pass the `setToast` prop to every admin create page —  `NewGroupPage`, `NewUserPage`, and `NewFormPage` — so all three pages share the same toast pattern on success and failure. The `setToast` setter is the existing toast-stack hook owned by the App component; no new toast plumbing is introduced.

#### Scenario: setToast is passed to all three create pages

- **WHEN** `App.tsx` renders the admin routes
- **THEN** `NewGroupPage`, `NewUserPage`, and `NewFormPage` all receive `setToast` as a prop

---

### Requirement: itsmApi includes non-JSON 5xx bodies in thrown errors

`gdfkube-itsm/src/api/itsmApi.ts` MUST capture non-JSON response bodies on error paths. When `response.json()` throws (HTML, plain text, empty body), the API client MUST fall back to `response.text()` and append the (truncated) raw text to the thrown error's message — alongside the HTTP `statusText` — so the SPA's toast surface can show meaningful 5xx diagnostics. Call signatures of the existing API helpers MUST remain unchanged.

#### Scenario: 5xx with JSON body

- **GIVEN** the server returns `500 Internal Server Error` with body `{ "error": "DB unavailable" }`
- **WHEN** any `itsmApi.<entity>.<method>` call rejects
- **THEN** the thrown error's message includes `"DB unavailable"`

#### Scenario: 5xx with non-JSON body (HTML stack trace)

- **GIVEN** the server returns `500 Internal Server Error` with a non-JSON HTML body
- **WHEN** any `itsmApi.<entity>.<method>` call rejects
- **THEN** the thrown error's message includes the HTTP statusText
- **AND** a (truncated) prefix of the raw response body
- **AND** the call signature of the API helper is unchanged

#### Scenario: 5xx with empty body

- **GIVEN** the server returns `502 Bad Gateway` with no body
- **WHEN** any `itsmApi.<entity>.<method>` call rejects
- **THEN** the thrown error's message includes `"502"` and `"Bad Gateway"`
