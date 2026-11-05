export interface IGoogleProfile {
  id: string;
  emails?: { value: string; verified?: boolean }[];
  photos?: { value: string }[];
  name?: { givenName?: string; familyName?: string };
}
