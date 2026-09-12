"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchUsers, sendFriendRequest } from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";

interface FoundUser {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export default function FriendSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSending, startSend] = useTransition();

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startSearch(async () => {
      setResults(await searchUsers(query));
      setSearched(true);
    });
  }

  function handleAdd(userId: string) {
    setMessage(null);
    startSend(async () => {
      const result = await sendFriendRequest(userId);
      if (result && "error" in result && result.error) setMessage(result.error);
      else {
        setMessage("Request sent");
        router.refresh();
      }
    });
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4 gap-3">
        <h2 className="font-semibold text-sm">Find friends</h2>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username or name"
            className="input input-bordered input-sm flex-1"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSearching || query.trim().length < 2}>
            {isSearching && <span className="loading loading-spinner loading-xs" />}
            Search
          </button>
        </form>

        {message && <p className="text-sm opacity-70">{message}</p>}

        {searched && !isSearching && results.length === 0 && (
          <p className="text-sm opacity-60">Nobody found. They may not have set a username yet.</p>
        )}

        <div className="flex flex-col gap-2">
          {results.map((person) => (
            <div key={person.id} className="flex items-center gap-3">
              <Avatar url={person.avatar_url} name={person.display_name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{person.display_name ?? "Unnamed"}</p>
                {person.username && <p className="text-xs opacity-60">@{person.username}</p>}
              </div>
              <button
                type="button"
                className="btn btn-outline btn-xs"
                disabled={isSending}
                onClick={() => handleAdd(person.id)}
              >
                Add friend
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
