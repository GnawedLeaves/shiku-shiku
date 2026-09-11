// Hand-written to match supabase/migrations/0001_init.sql. Once the Supabase
// project exists, prefer regenerating this with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts

export type AnswerDisplayMode = "romaji" | "hiragana" | "both";
export type SessionStatus = "active" | "paused" | "completed";

export type QueueEntry =
  | { type: "card"; cardId: string; status: "pending" | "correct" | "incorrect" }
  | {
      type: "group";
      groupId: string;
      cardIds: string[];
      statuses: Record<string, "pending" | "correct" | "incorrect">;
    };

export interface SessionScope {
  setId: string;
  groupIds?: string[];
  mode: "all" | "random";
  count?: number | "all";
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          answer_display_mode: AnswerDisplayMode;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          answer_display_mode?: AnswerDisplayMode;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          answer_display_mode?: AnswerDisplayMode;
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
          share_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          share_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          share_code?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          set_id: string;
          group_id: string | null;
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
          group_id?: string | null;
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
          group_id?: string | null;
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
          score_percentage: number;
          completed_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          user_id: string;
          set_id?: string | null;
          score_percentage: number;
          completed_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          user_id?: string;
          set_id?: string | null;
          score_percentage?: number;
          completed_at?: string;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
