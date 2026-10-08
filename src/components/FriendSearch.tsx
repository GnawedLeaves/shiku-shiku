"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchUsers, sendFriendRequest } from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";

interface FoundUser {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function FriendSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSending, startSend] = useTransition();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // Each search gets a number; a slow response for an older query is dropped
  // so results never jump back to what was typed a moment ago.
  const latestSearch = useRef(0);

  function runSearch(term: string) {
    const id = ++latestSearch.current;
    startSearch(async () => {
      const found = await searchUsers(term);
      if (id !== latestSearch.current) return;
      setResults(found);
      setSearched(true);
    });
  }

  // Search as the user types, once they pause.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) return;
    const timer = window.setTimeout(() => runSearch(term), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  function handleChange(value: string) {
    setQuery(value);
    setMessage(null);
    // Too short to search: drop any results (and cancel one in flight).
    if (value.trim().length < MIN_QUERY_LENGTH) {
      latestSearch.current++;
      setResults([]);
      setSearched(false);
    }
  }

  // Enter searches straight away instead of waiting for the pause.
  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length >= MIN_QUERY_LENGTH) runSearch(query.trim());
  }

  function clear() {
    handleChange("");
    inputRef.current?.focus();
  }

  function handleAdd(userId: string) {
    setMessage(null);
    setSendingTo(userId);
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
    <div className="card bg-base-100">
      <div className="card-body p-4 gap-3">
        <h2 className="font-semibold text-sm">Find friends</h2>

        <form onSubmit={handleSearch} role="search">
          <label className="input input-bordered input-sm flex w-full items-center gap-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Username or name"
              aria-label="Search for friends by username or name"
              className="grow min-w-0"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {isSearching && (
              <span className="loading loading-spinner loading-xs opacity-60" aria-label="Searching" />
            )}
            {query && (
              <button
                type="button"
                onClick={clear}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full opacity-60 hover:bg-iron hover:text-concrete hover:opacity-100"
                aria-label="Clear search"
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </label>
          {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
            <p className="mt-1 text-xs opacity-60">Keep typing — at least 2 characters.</p>
          )}
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
                {isSending && sendingTo === person.id && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                Add friend
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
