import type { Metadata } from "next";
import DisplaySettings from "@/components/DisplaySettings";
import PlainPage from "@/components/PlainPage";

export const metadata: Metadata = { title: "Display settings" };

export default function DisplayPage() {
  return (
    <PlainPage title="Display settings">
      <DisplaySettings />
    </PlainPage>
  );
}
