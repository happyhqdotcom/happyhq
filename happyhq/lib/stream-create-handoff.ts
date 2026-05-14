// One-shot handoff payload from the Create Stream dialog to the destination
// stream page. The dialog stashes this in sessionStorage right before
// router.push; DesktopInitializer consumes (and removes) it after clearAll()
// on the new route, then opens the seeded chat window.
//
// Lives in lib/ (not under the dialog feature) so the consumer
// (DesktopInitializer) doesn't have to depend on a feature-level module.

export const streamCreateHandoffKey = (slug: string) =>
  `happyhq:stream-create:${slug}`

export type StreamCreateHandoff = {
  intent: string
  maximize?: boolean
}
