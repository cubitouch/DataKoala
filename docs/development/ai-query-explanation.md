# AI query explanations

PostgreSQL raw SQL has an **Explain Query with AI** action. It opens a semantic explanation surface without executing SQL. Select **Generate AI diagram** to send the captured query and bounded relevant schema metadata to the configured OpenRouter model.

The same diagram action is available after both **Explain** and **Explain Analyze**. The database plan stays available below the diagram. Explain Analyze retains its existing execution behavior; generating an AI diagram never executes the query again. The AI does not receive the plan, result rows or timings, so its highlights explain SQL semantics rather than measured performance.

Select a diagram node or an AI highlight to highlight its related SQL fragment in the read-only captured query. Editing the main editor does not change this snapshot; the pane indicates when the editor differs. Closing the pane, changing tabs, replacing the plan or changing connections discards the explanation and cancels any active request. Explanations are transient and are not saved in workspaces or presets.

AI details shows the submitted SQL and bounded schema context. The feature uses the existing saved AI settings and secret storage. No database credentials, connection configuration, result rows or execution plans are included. As with Ask AI, SQL itself may contain sensitive literals.

## Validation

The main process reconstructs an allowlisted request and validates PostgreSQL context budgets before contacting the provider. Structured responses are limited to 24 nodes, 48 edges and 12 highlights. Node IDs must be unique, references must exist, edges must be unique and acyclic, and every node's SQL fragment must occur verbatim in the captured query. React renders labels and text; model output cannot inject HTML or diagram source code.

Tests cover request disclosure, invalid output, representative SQL fragments, provider serialization, lazy preparation, cancellation, late responses, both Explain modes, SQL linking and behavior without AI configuration. Deterministic fixtures validate the contract and rendering; they do not prove live-model semantic accuracy.

## Manual checks

1. Configure an OpenRouter model supporting structured output. Open PostgreSQL SQL containing joins, filters, aggregation, sorting and a limit.
2. Open **Explain Query with AI**, inspect AI details, then generate a diagram. Check that important operations are represented and highlights match the SQL.
3. Select nodes and highlights; verify the marked SQL and selected nodes. Check a LEFT JOIN, CTE, nested query and window expression, including any assumptions.
4. Run **Explain**, then generate its diagram. Repeat with **Explain Analyze** on a safe read-only query. Confirm the database plan remains visible and diagram generation does not rerun the database query.
5. Edit the SQL after receiving a plan: the pane must show a snapshot notice and keep explaining the captured SQL.
6. Cancel during preparation or generation, close the pane, switch tabs and change connections. A late response must not appear in another explanation. Retry should work.
7. Remove the AI configuration. Existing Explain and Explain Analyze should still work with the database plan alone.

## Current limits

The first version supports PostgreSQL and one bounded metadata request. SQL-to-diagram selection, exact disambiguation of repeated identical SQL fragments, diagram export, additional engines and execution-plan visualization are not implemented. A repeated fragment currently highlights its first occurrence. Recursive queries must be simplified into an acyclic semantic representation. The model may still misunderstand semantics despite structural and fragment validation.
