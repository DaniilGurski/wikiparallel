# Bridges are graded, not refused

Every Bridge now comes back with a Strength — `strong` or `loose` — and is shown
to the person in full either way. The model is no longer allowed to answer that
two things have no real parallel, which supersedes the clause in ADR-0004 that
made an inaccurate Bridge tolerable "because the model is allowed to answer that
there is no parallel". ADR-0004's actual decision — a hosted model, called from
the browser with the person's own key — is untouched.

We changed this because the refusal path fired on most cards, and a refusal is
the one answer a person can do nothing with. The cause is that retrieval and the
Bridge judge were answering different questions: `rankParallels` scores topical
proximity between lead sections, while the Bridge prompt demanded a shared
underlying mechanism — a strictly harder test than the one that put the article
on the page. Measurements behind `docs/evaluation.md` show why this cannot be
fixed in retrieval on the current budget: similarity across the Corpus is nearly
flat (the gap between the best and the two-hundredth article is about 0.05, or
five points of Closeness), a handful of centroid-hub articles such as *Algorithm*
win on most Challenges, and mean-centring the Embeddings spreads the numbers out
while making hubness worse. On several Challenges there is genuinely no good
Parallel in the Corpus to find, which is the ceiling ADR-0002 accepts.

We considered three alternatives. Keeping the refusal and fixing retrieval
instead is the principled answer, but needs either a wider Corpus (ADR-0002) or
build-time enrichment of what gets embedded, and neither fits before the hand-in.
Reranking candidates with the same hosted model would spend on every search
forever, against a near-zero budget. Simply removing the refusal without a
replacement was rejected because it makes the tool claim every pairing is equally
good, and articulating a cross-Field analogy is exactly the task where a reader
cannot tell a real mapping from a fluent one — the reason ADR-0004 rejected a
small in-browser generative model.

The cost we accept is that honesty now rests on a label the model applies to its
own work rather than on its silence, so a mislabelled `strong` is a worse failure
than a refusal used to be. The prompt states plainly that most pairings are loose
and must not be upgraded, an unreadable Strength degrades to `loose` rather than
`strong`, and the generated-text disclaimer stays on every Bridge.
