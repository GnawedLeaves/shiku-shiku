import type { QueueEntry } from "@/lib/supabase/database.types";

interface CardLike {
  id: string;
  group_id: string | null;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds a study queue from a flat list of cards.
 * - "random": individual cards, sampled without group bundling.
 * - "all": cards sharing a group_id are bundled into one queue entry so the
 *   whole group is shown together; ungrouped cards stay individual.
 */
export function buildQueue(
  cards: CardLike[],
  options: { mode: "all" | "random"; count?: number | "all" }
): QueueEntry[] {
  if (options.mode === "random") {
    const requested = options.count === "all" || !options.count ? cards.length : options.count;
    const n = Math.min(requested, cards.length);
    return shuffle(cards)
      .slice(0, n)
      .map((c) => ({ type: "card", cardId: c.id, status: "pending" }) as const);
  }

  const groupOrder: string[] = [];
  const groupCardIds = new Map<string, string[]>();
  const order: Array<{ kind: "card" | "group"; id: string }> = [];

  for (const card of cards) {
    if (card.group_id) {
      if (!groupCardIds.has(card.group_id)) {
        groupCardIds.set(card.group_id, []);
        groupOrder.push(card.group_id);
        order.push({ kind: "group", id: card.group_id });
      }
      groupCardIds.get(card.group_id)!.push(card.id);
    } else {
      order.push({ kind: "card", id: card.id });
    }
  }

  return order.map((entry): QueueEntry => {
    if (entry.kind === "card") {
      return { type: "card", cardId: entry.id, status: "pending" };
    }
    const cardIds = groupCardIds.get(entry.id)!;
    return {
      type: "group",
      groupId: entry.id,
      cardIds,
      statuses: Object.fromEntries(cardIds.map((id) => [id, "pending" as const])),
    };
  });
}
