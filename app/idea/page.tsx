import { FlowPage } from '../flow';

export default function IdeaPage() {
  return (
    <FlowPage
      kind="idea"
      title="Start from an idea"
      placeholder="A wearable that detects dehydration from skin conductance and tells a phone app…"
      hint="Lab searches openidea.world for prior work, asks Muse Spark whether it is buildable, drafts a prototype and runs it in your browser."
    />
  );
}
