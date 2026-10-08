// Hand-written to match supabase/migrations/*.sql. Once the Supabase project
// exists, prefer regenerating this with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts

export type AnswerDisplayMode = "romaji" | "hiragana" | "both";
export type SessionStatus = "active" | "paused" | "completed";
export type FriendshipStatus = "pending" | "accepted" | "declined";
export type BattleRoomStatus = "lobby" | "in_progress" | "finished";
export type BattleInviteStatus = "pending" | "accepted" | "declined";

/** Points balance and medals, from my_reward_summary(). */
export interface RewardSummary {
  points: number;
  medals: { id: string; name: string }[];
  next_medal: { id: string; name: string; threshold: number } | null;
}

/** One card of a battle's deck, snapshotted when the battle starts. */
export interface BattleCard {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  answer_kanji: string | null;
  notes: string | null;
}

/** One graded card inside a finished session, stored on `session_results`. */
export interface SessionResultDetail {
  card_id: string;
  question: string | null;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  result: "correct" | "incorrect" | "pending";
  /** Times "don't know" was pressed on this card (flashcards mode). */
  misses?: number;
}

export interface RecordSwipeResult {
  queue: QueueEntry[];
  currentIndex: number;
  isComplete: boolean;
  correct?: number;
  total?: number;
}

/**
 * `misses` counts "don't know" presses in flashcards mode, where a missed card
 * stays pending and goes back into the deck instead of being marked wrong.
 */
export type QueueEntry =
  | { type: "card"; cardId: string; status: "pending" | "correct" | "incorrect"; misses?: number }
  | {
      type: "group";
      groupId: string;
      cardIds: string[];
      statuses: Record<string, "pending" | "correct" | "incorrect">;
      misses?: Record<string, number>;
    };

export type StudyMode = "quiz" | "flashcards";

export interface SessionScope {
  setId: string;
  groupIds?: string[];
  mode: "all" | "random";
  count?: number | "all";
  /** Study in random order. Absent on older sessions: random samples were always shuffled. */
  shuffle?: boolean;
  /** Absent on older sessions, which are all quiz mode. */
  studyMode?: StudyMode;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
          answer_display_mode: AnswerDisplayMode;
          pdf_template_id: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          answer_display_mode?: AnswerDisplayMode;
          pdf_template_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          answer_display_mode?: AnswerDisplayMode;
          pdf_template_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          color: string | null;
          share_code: string | null;
          origin_set_id: string | null;
          is_public: boolean;
          is_private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          color?: string | null;
          share_code?: string | null;
          origin_set_id?: string | null;
          is_public?: boolean;
          is_private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          color?: string | null;
          share_code?: string | null;
          origin_set_id?: string | null;
          is_public?: boolean;
          is_private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          set_id: string;
          name: string;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          name: string;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          name?: string;
          color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      card_groups: {
        Row: { card_id: string; group_id: string; created_at: string };
        Insert: { card_id: string; group_id: string; created_at?: string };
        Update: { card_id?: string; group_id?: string; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "card_groups_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "card_groups_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          id: string;
          set_id: string;
          question: string;
          answer_hiragana: string | null;
          answer_romaji: string | null;
          answer_kanji: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          question: string;
          answer_hiragana?: string | null;
          answer_romaji?: string | null;
          answer_kanji?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          question?: string;
          answer_hiragana?: string | null;
          answer_romaji?: string | null;
          answer_kanji?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      study_sessions: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          status: SessionStatus;
          scope: SessionScope;
          queue: QueueEntry[];
          current_index: number;
          active_seconds: number;
          started_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          status?: SessionStatus;
          scope: SessionScope;
          queue: QueueEntry[];
          current_index?: number;
          active_seconds?: number;
          started_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string | null;
          status?: SessionStatus;
          scope?: SessionScope;
          queue?: QueueEntry[];
          current_index?: number;
          active_seconds?: number;
          started_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      card_progress: {
        Row: {
          user_id: string;
          card_id: string;
          times_correct: number;
          times_incorrect: number;
          last_reviewed_at: string | null;
        };
        Insert: {
          user_id: string;
          card_id: string;
          times_correct?: number;
          times_incorrect?: number;
          last_reviewed_at?: string | null;
        };
        Update: {
          user_id?: string;
          card_id?: string;
          times_correct?: number;
          times_incorrect?: number;
          last_reviewed_at?: string | null;
        };
        Relationships: [];
      };
      session_results: {
        Row: {
          id: string;
          session_id: string | null;
          user_id: string;
          set_id: string | null;
          set_name: string | null;
          score_percentage: number;
          correct_count: number;
          total_count: number;
          duration_seconds: number | null;
          details: SessionResultDetail[];
          completed_at: string;
          study_mode: StudyMode;
          dont_know_count: number;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          user_id: string;
          set_id?: string | null;
          set_name?: string | null;
          score_percentage: number;
          correct_count?: number;
          total_count?: number;
          duration_seconds?: number | null;
          details?: SessionResultDetail[];
          completed_at?: string;
          study_mode?: StudyMode;
          dont_know_count?: number;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          user_id?: string;
          set_id?: string | null;
          set_name?: string | null;
          score_percentage?: number;
          correct_count?: number;
          total_count?: number;
          duration_seconds?: number | null;
          details?: SessionResultDetail[];
          completed_at?: string;
          study_mode?: StudyMode;
          dont_know_count?: number;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendshipStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: FriendshipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: FriendshipStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      battle_rooms: {
        Row: {
          id: string;
          code: string;
          host_id: string;
          set_id: string | null;
          name: string | null;
          status: BattleRoomStatus;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          deck: BattleCard[] | null;
          winner_id: string | null;
          set_name: string | null;
          card_count: number | null;
          max_players: number;
          shuffle: boolean;
          card_limit: number | null;
          rematch_room_id: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          host_id: string;
          set_id?: string | null;
          name?: string | null;
          status?: BattleRoomStatus;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          deck?: BattleCard[] | null;
          winner_id?: string | null;
          set_name?: string | null;
          card_count?: number | null;
          max_players?: number;
          shuffle?: boolean;
          card_limit?: number | null;
          rematch_room_id?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          host_id?: string;
          set_id?: string | null;
          name?: string | null;
          status?: BattleRoomStatus;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          deck?: BattleCard[] | null;
          winner_id?: string | null;
          set_name?: string | null;
          card_count?: number | null;
          max_players?: number;
          shuffle?: boolean;
          card_limit?: number | null;
          rematch_room_id?: string | null;
        };
        Relationships: [];
      };
      battle_room_members: {
        Row: {
          room_id: string;
          user_id: string;
          score: number;
          is_ready: boolean;
          joined_at: string;
          queue: QueueEntry[] | null;
          current_index: number;
          cleared: number;
          dont_know: number;
          first_try: number;
          finished_at: string | null;
          placement: number | null;
          forfeited_at: string | null;
          left_at: string | null;
        };
        Insert: {
          room_id: string;
          user_id: string;
          score?: number;
          is_ready?: boolean;
          joined_at?: string;
          queue?: QueueEntry[] | null;
          current_index?: number;
          cleared?: number;
          dont_know?: number;
          first_try?: number;
          finished_at?: string | null;
          placement?: number | null;
          forfeited_at?: string | null;
          left_at?: string | null;
        };
        Update: {
          room_id?: string;
          user_id?: string;
          score?: number;
          is_ready?: boolean;
          joined_at?: string;
          queue?: QueueEntry[] | null;
          current_index?: number;
          cleared?: number;
          dont_know?: number;
          first_try?: number;
          finished_at?: string | null;
          placement?: number | null;
          forfeited_at?: string | null;
          left_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "battle_room_members_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "battle_rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_ledger: {
        Row: {
          id: string;
          user_id: string;
          points: number;
          source: string;
          source_id: string | null;
          reason: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      battle_messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          body: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      battle_invites: {
        Row: {
          id: string;
          room_id: string;
          from_user: string;
          to_user: string;
          status: BattleInviteStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          from_user: string;
          to_user: string;
          status?: BattleInviteStatus;
          created_at?: string;
        };
        Update: {
          status?: BattleInviteStatus;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      import_shared_set: {
        Args: { p_share_code: string };
        Returns: string;
      };
      copy_cards_into_set: {
        Args: { p_card_ids: string[]; p_target_set_id: string };
        Returns: number;
      };
      record_swipe: {
        Args: {
          p_session_id: string;
          p_card_id: string;
          p_result: string;
          p_requeue_position?: number;
        };
        Returns: RecordSwipeResult;
      };
      set_scoreboard: {
        Args: { p_set_id: string };
        Returns: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          best_score: number;
          sessions_played: number;
          last_played: string;
        }[];
      };
      join_battle_room: {
        Args: { p_code: string };
        Returns: string;
      };
      accept_battle_invite: {
        Args: { p_invite: string };
        Returns: string;
      };
      battle_set_options: {
        Args: { p_room: string };
        Returns: { id: string; name: string; owner_id: string; card_count: number }[];
      };
      start_battle: {
        Args: { p_room: string };
        Returns: undefined;
      };
      finish_battle: {
        Args: { p_room: string };
        Returns: string | null;
      };
      forfeit_battle: {
        Args: { p_room: string };
        Returns: undefined;
      };
      rematch_battle: {
        Args: { p_room: string };
        Returns: string;
      };
      my_reward_summary: {
        Args: Record<string, never>;
        Returns: RewardSummary;
      };
      friend_profile_sets: {
        Args: { p_user: string };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          color: string | null;
          card_count: number;
          created_at: string;
        }[];
      };
      friend_profile_history: {
        Args: { p_user: string; p_limit?: number };
        Returns: {
          id: string;
          session_name: string | null;
          set_name: string | null;
          study_mode: StudyMode;
          score_percentage: number;
          correct_count: number;
          total_count: number;
          dont_know_count: number;
          duration_seconds: number | null;
          completed_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
