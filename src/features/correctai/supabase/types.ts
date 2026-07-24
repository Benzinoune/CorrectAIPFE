export type UserRole = 'super_admin' | 'admin' | 'professor' | 'student';
export type UserStatus = 'ACTIF' | 'INACTIF' | 'SUSPENDU';
export type EstablishmentStatus = 'ACTIF' | 'INACTIF' | 'SUSPENDU';
export type ExamStatus = 'ACTIF' | 'BROUILLON' | 'EN COURS' | 'A VENIR' | 'TERMINE';
export type CopyReviewStatus = 'PENDING' | 'DETECTED' | 'VALIDATED' | 'CORRECTED';
export type ResponseSheetId = '20' | '50' | '100';
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface Database {
  public: {
    Tables: {
      establishments: {
        Row: {
          id: string;
          name: string;
          city: string;
          admin_name: string;
          admin_email: string;
          status: EstablishmentStatus;
          professors_count: number;
          students_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          city: string;
          admin_name: string;
          admin_email: string;
          status?: EstablishmentStatus;
          professors_count?: number;
          students_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          city?: string;
          admin_name?: string;
          admin_email?: string;
          status?: EstablishmentStatus;
          professors_count?: number;
          students_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          initials: string;
          first_name: string;
          last_name: string;
          email: string;
          status: UserStatus;
          establishment_id: string | null;
          matricule: string | null;
          external_ref: string | null;
          correct_ai_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          initials: string;
          first_name: string;
          last_name: string;
          email: string;
          status?: UserStatus;
          establishment_id?: string | null;
          matricule?: string | null;
          external_ref?: string | null;
          correct_ai_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          initials?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          status?: UserStatus;
          establishment_id?: string | null;
          matricule?: string | null;
          external_ref?: string | null;
          correct_ai_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      classes: {
        Row: {
          id: string;
          name: string;
          establishment_id: string;
          students_count: number;
          exams_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          establishment_id: string;
          students_count?: number;
          exams_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          establishment_id?: string;
          students_count?: number;
          exams_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      student_classes: {
        Row: {
          student_id: string;
          class_id: string;
        };
        Insert: {
          student_id: string;
          class_id: string;
        };
        Update: {
          student_id?: string;
          class_id?: string;
        };
      };
      exams: {
        Row: {
          id: string;
          name: string;
          subject: string;
          class_name: string;
          professor_id: string | null;
          establishment_id: string;
          date: string;
          questions: number;
          status: ExamStatus;
          response_sheet_id: ResponseSheetId | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          subject: string;
          class_name?: string;
          professor_id?: string | null;
          establishment_id: string;
          date: string;
          questions?: number;
          status?: ExamStatus;
          response_sheet_id?: ResponseSheetId | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          subject?: string;
          class_name?: string;
          professor_id?: string | null;
          establishment_id?: string;
          date?: string;
          questions?: number;
          status?: ExamStatus;
          response_sheet_id?: ResponseSheetId | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      exam_classes: {
        Row: {
          exam_id: string;
          class_id: string;
        };
        Insert: {
          exam_id: string;
          class_id: string;
        };
        Update: {
          exam_id?: string;
          class_id?: string;
        };
      };
      exam_questions: {
        Row: {
          id: string;
          exam_id: string;
          number: number;
          correct_answers: string[];
          detected_answers: string[] | null;
          points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          number: number;
          correct_answers?: string[];
          detected_answers?: string[] | null;
          points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          number?: number;
          correct_answers?: string[];
          detected_answers?: string[] | null;
          points?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      scanned_copies: {
        Row: {
          id: string;
          exam_id: string;
          exam_name: string;
          student_id: string | null;
          student_name: string;
          matricule: string;
          class_name: string;
          establishment_id: string | null;
          scanned_at: string;
          image_url: string | null;
          annotated_image_url: string | null;
          ai_confidence: number;
          review_status: CopyReviewStatus;
          detected_answers: string[];
          detected_answers_count: number;
          calculated_score: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          exam_name: string;
          student_id?: string | null;
          student_name: string;
          matricule: string;
          class_name: string;
          establishment_id?: string | null;
          scanned_at?: string;
          image_url?: string | null;
          annotated_image_url?: string | null;
          ai_confidence?: number;
          review_status?: CopyReviewStatus;
          detected_answers?: string[];
          detected_answers_count?: number;
          calculated_score?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          exam_name?: string;
          student_id?: string | null;
          student_name?: string;
          matricule?: string;
          class_name?: string;
          establishment_id?: string | null;
          scanned_at?: string;
          image_url?: string | null;
          annotated_image_url?: string | null;
          ai_confidence?: number;
          review_status?: CopyReviewStatus;
          detected_answers?: string[];
          detected_answers_count?: number;
          calculated_score?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ocr_results: {
        Row: {
          id: string;
          copy_id: string;
          extracted: boolean;
          name: string | null;
          matricule: string | null;
          class_name: string | null;
          confidence: number;
          missing_fields: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          copy_id: string;
          extracted?: boolean;
          name?: string | null;
          matricule?: string | null;
          class_name?: string | null;
          confidence?: number;
          missing_fields?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          copy_id?: string;
          extracted?: boolean;
          name?: string | null;
          matricule?: string | null;
          class_name?: string | null;
          confidence?: number;
          missing_fields?: string[];
          created_at?: string;
        };
      };
      omr_results: {
        Row: {
          id: string;
          copy_id: string;
          detected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          copy_id: string;
          detected?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          copy_id?: string;
          detected?: boolean;
          created_at?: string;
        };
      };
      omr_answers: {
        Row: {
          id: string;
          omr_result_id: string;
          question_number: number;
          answer: string | null;
          confidence: number;
        };
        Insert: {
          id?: string;
          omr_result_id: string;
          question_number: number;
          answer?: string | null;
          confidence?: number;
        };
        Update: {
          id?: string;
          omr_result_id?: string;
          question_number?: number;
          answer?: string | null;
          confidence?: number;
        };
      };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      establishment_status: EstablishmentStatus;
      exam_status: ExamStatus;
      copy_review_status: CopyReviewStatus;
      response_sheet_id: ResponseSheetId;
      tone: Tone;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
