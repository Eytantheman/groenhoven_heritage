export interface HousingProject {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  city: string;
  architect: string;
  era: string;
  social_org: string | null;
  scale: string | null;
  note: string | null;
  bag_id: string | null;
  description: string;
}
