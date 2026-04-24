export interface Profile_Entry {
   absolute_path: string;
   basename: string;
}

export class Profile {
   name: string;
   active_ifs: Profile_Entry[];

   /**
    * @param {string} profile_name - Display name for the profile.
    * @param {Profile_Entry[]} active_entries - Entries representing the activated instruction files.
    */
   constructor(profile_name: string, active_entries: Profile_Entry[] = []) {
      this.name = profile_name.trim();
      this.active_ifs = active_entries
         .filter(entry => !!entry && !!entry.absolute_path)
         .map(entry => ({
            absolute_path: entry.absolute_path.trim(),
            basename: entry.basename.trim(),
         }));
   }
}
