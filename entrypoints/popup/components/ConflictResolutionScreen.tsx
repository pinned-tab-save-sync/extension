import type { ConflictData } from "../hooks/useGroups";
import { Button } from "./ui/Button";

interface ConflictResolutionScreenProps {
  conflict: ConflictData;
  onResolve: (choice: "discard" | "merge") => Promise<void>;
  isLoading: boolean;
}

export function ConflictResolutionScreen({
  conflict,
  onResolve,
  isLoading,
}: ConflictResolutionScreenProps) {
  const localCount = Object.keys(conflict.localGroups).length;
  const apiCount = Object.keys(conflict.apiGroups).length;

  return (
    <div className="min-w-[350px] min-h-[200px] p-4 font-sans text-white/85 bg-[#242424]">
      <h1 className="text-2xl mb-3 text-center">Sync Conflict</h1>
      <p className="text-center mb-4 text-sm">
        You have <strong>{localCount}</strong> local tab group
        {localCount !== 1 ? "s" : ""} and <strong>{apiCount}</strong> synced
        group{apiCount !== 1 ? "s" : ""} from your account.
      </p>

      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-white/5 rounded-md p-3">
          <h3 className="text-sm mb-2 text-gray-400">Local Groups</h3>
          <ul className="list-none p-0 m-0 text-sm">
            {Object.entries(conflict.localGroups).map(([name, urls]) => (
              <li key={name} className="py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                {name} ({urls.length} tabs)
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1 bg-white/5 rounded-md p-3">
          <h3 className="text-sm mb-2 text-gray-400">Synced Groups</h3>
          <ul className="list-none p-0 m-0 text-sm">
            {Object.entries(conflict.apiGroups).map(([name, urls]) => (
              <li key={name} className="py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                {name} ({urls.length} tabs)
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mb-4 italic">
        Note: If both have a group with the same name, the synced version will
        be kept.
      </p>

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          fullWidth
          onClick={() => onResolve("merge")}
          disabled={isLoading}
        >
          {isLoading ? "Merging..." : "Merge All Groups"}
        </Button>
        <Button
          variant="outline"
          fullWidth
          onClick={() => onResolve("discard")}
          disabled={isLoading}
        >
          {isLoading ? "Discarding..." : "Discard Local Groups"}
        </Button>
      </div>
    </div>
  );
}
