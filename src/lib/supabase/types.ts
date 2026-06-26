export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      rooms: {
        Row: { id: string; location_id: string; name: string; created_at: string };
        Insert: { id?: string; location_id: string; name: string; created_at?: string };
        Update: { id?: string; location_id?: string; name?: string; created_at?: string };
        Relationships: [{ foreignKeyName: "rooms_location_id_fkey"; columns: ["location_id"]; referencedRelation: "locations"; referencedColumns: ["id"] }];
      };
      profiles: {
        Row: { id: string; name: string; email: string; is_admin: boolean; last_login_at: string | null; created_at: string };
        Insert: { id: string; name: string; email: string; is_admin?: boolean; last_login_at?: string | null; created_at?: string };
        Update: { id?: string; name?: string; email?: string; is_admin?: boolean; last_login_at?: string | null; created_at?: string };
        Relationships: [];
      };
      invited_emails: {
        Row: { id: string; email: string; invited_by: string | null; is_admin: boolean; created_at: string };
        Insert: { id?: string; email: string; invited_by?: string | null; is_admin?: boolean; created_at?: string };
        Update: { id?: string; email?: string; invited_by?: string | null; is_admin?: boolean; created_at?: string };
        Relationships: [];
      };
      allocation_series: {
        Row: {
          id: string; user_id: string; room_id: string; day_of_week: number;
          start_time: string; duration_minutes: number; series_start: string;
          series_end: string; created_at: string;
        };
        Insert: {
          id?: string; user_id: string; room_id: string; day_of_week: number;
          start_time: string; duration_minutes: number; series_start: string;
          series_end: string; created_at?: string;
        };
        Update: {
          id?: string; user_id?: string; room_id?: string; day_of_week?: number;
          start_time?: string; duration_minutes?: number; series_start?: string;
          series_end?: string; created_at?: string;
        };
        Relationships: [];
      };
      allocations: {
        Row: {
          id: string; series_id: string | null; user_id: string; room_id: string;
          date: string; start_time: string; duration_minutes: number; title: string | null;
          status: "active" | "cancelled"; created_at: string;
        };
        Insert: {
          id?: string; series_id?: string | null; user_id: string; room_id: string;
          date: string; start_time: string; duration_minutes: number; title?: string | null;
          status?: "active" | "cancelled"; created_at?: string;
        };
        Update: {
          id?: string; series_id?: string | null; user_id?: string; room_id?: string;
          date?: string; start_time?: string; duration_minutes?: number; title?: string | null;
          status?: "active" | "cancelled"; created_at?: string;
        };
        Relationships: [];
      };
      room_hours: {
        Row: { id: string; room_id: string; day_of_week: number; open_time: string; close_time: string };
        Insert: { id?: string; room_id: string; day_of_week: number; open_time: string; close_time: string };
        Update: { id?: string; room_id?: string; day_of_week?: number; open_time?: string; close_time?: string };
        Relationships: [];
      };
      swap_requests: {
        Row: {
          id: string; requester_id: string; requester_allocation_id: string;
          target_allocation_id: string;
          status: "pending" | "accepted" | "declined" | "cancelled"; created_at: string;
        };
        Insert: {
          id?: string; requester_id: string; requester_allocation_id: string;
          target_allocation_id: string;
          status?: "pending" | "accepted" | "declined" | "cancelled"; created_at?: string;
        };
        Update: {
          id?: string; requester_id?: string; requester_allocation_id?: string;
          target_allocation_id?: string;
          status?: "pending" | "accepted" | "declined" | "cancelled"; created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      touch_last_login: { Args: Record<string, never>; Returns: void };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type InvitedEmail = Database["public"]["Tables"]["invited_emails"]["Row"];
export type RoomHours = Database["public"]["Tables"]["room_hours"]["Row"];
export type RoomWithHours = Room & { room_hours: RoomHours[] };
export type AllocationSeries = Database["public"]["Tables"]["allocation_series"]["Row"];
export type Allocation = Database["public"]["Tables"]["allocations"]["Row"];
export type SwapRequest = Database["public"]["Tables"]["swap_requests"]["Row"];

export type RoomWithLocation = Room & { locations: Location };
export type AllocationWithDetails = Allocation & {
  profiles: Profile;
  rooms: RoomWithLocation;
};
export type SwapRequestWithDetails = SwapRequest & {
  requester: Profile;
  requester_allocation: AllocationWithDetails;
  target_allocation: AllocationWithDetails;
};
