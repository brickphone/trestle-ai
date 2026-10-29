import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="p-6">
      <EmptyState
        title="Page not found"
        description="The page or record you requested does not exist."
        action={<ButtonLink href="/">Go to overview</ButtonLink>}
      />
    </div>
  );
}
