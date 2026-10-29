import { LoadingState } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="p-6">
      <LoadingState label="Loading page" />
    </div>
  );
}
