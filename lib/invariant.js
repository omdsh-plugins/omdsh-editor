//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@omdsh-plugins/omdsh-editor`.
* @module @omdsh-plugins/omdsh-editor/invariant
*/
const PACKAGE_NAME = "@omdsh-plugins/omdsh-editor";
/** Cordis companion plugin name. */
const name = "omdsh-editor-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant. The host half holds one piece of state — a cached
* detection sweep with a TTL — whose only rule (a stale sweep is re-probed,
* never served) this package's own specs assert directly; the browser half
* derives everything it shows from that sweep plus the workspace list and
* emits no cordis events, so there is no cross-plugin state an invariant
* could watch.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
