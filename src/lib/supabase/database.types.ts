// Hand-written to match supabase/migrations/*.sql. Once the Supabase project
// exists, prefer regenerating this with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts

export type AnswerDisplayMode = "romaji" | "hiragana" | "both";
export type SessionStatus = "active" | "paused" | "completed";
export type FriendshipStatus = "pending" | "accepted" | "declined";
export type BattleRoomStatus = "lobby" | "in_progress" | "finished";

/** One graded card inside a finished session, stored on `session_results`. */
export interface SessionResultDetail {
  card_id: string;
  question: string | null;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  result: "correct" | "incorrect" | "pending";
}

export interface RecordSwipeResult {
  queue: QueueEntry[];
  currentIndex: number;
  isComplete: boolean;
  correct?: number;
  total?: number;
}

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
          share_code: string | null;
          origin_set_id: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          share_code?: string | null;
          origin_set_id?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          share_code?: string | null;
          origin_set_id?: string | null;
          is_public?: boolean;
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
        };
        Insert: {
          room_id: string;
          user_id: string;
          score?: number;
          is_ready?: boolean;
          joined_at?: string;
        };
        Update: {
          room_id?: string;
          user_id?: string;
          score?: number;
          is_ready?: boolean;
          joined_at?: string;
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
        Args: { p_session_id: string; p_card_id: string; p_result: string };
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
