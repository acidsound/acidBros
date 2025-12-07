---
description: Prepare for deployment by updating version and documentation
---

1. **Check Version Consistency**
   - Read `sw.js` and check `CACHE_NAME`.
   - Read `index.html` and check `.version-display`.
   - Ensure both match the intended new version.

2. **Update Service Worker Assets**
   - Check `sw.js` `ASSETS` array.
   - Ensure all new JavaScript, CSS, or asset files added in this release are included in the list.
   - Verify file paths are correct.

3. **Review Recent Changes**
   - Run `git log --oneline -n 10` to review recent commits.
   - Identify key features or bug fixes added since the last deployment.

3. **Update Project Context**
   - Edit `.agent/PROJECT_CONTEXT.md`:
     - Update `Current Version` field.
     - Update the **section header** `## Recent Changes (vXX-vYY)` to include the new version (e.g., `v57-v75` → `v57-v76`).
     - Add a new changelog entry under `### vXX: [Feature Name]` with summary of changes.
     - Update `Architecture` or `File Structure` if new files were added.

4. **Update User Manual**
   - Edit `USER_MANUAL.md`:
     - Add sections for any new user-facing features.
     - Update screenshots or descriptions if UI has changed.

5. **Update README**
   - Edit `README.md`:
     - Update feature lists or installation instructions if changed.
     - Ensure links to other documentation (like `SYNTH_ARCHITECTURE.md`) are correct.

6. **Sync Korean Documentation**
   - When updating any `*.md` file, check if a corresponding `*_ko.md` file exists.
   - If it exists, apply the same changes translated to Korean.
   - Currently localized files:
     - `USER_MANUAL.md` → `USER_MANUAL_ko.md`
   - Keep section structure and formatting consistent between versions.

7. **Final Verification**
   - Ensure all `*.md` files are consistent with the code state.
   - Verify Korean documentation is in sync with English version.

8. **Commit and Push**
   - `git add .`
   - `git commit -m "[Descriptive Message Summary]"`
   - *Example: `v65: Add MIDI Device Management and improve Learn Mode`*
   - `git push origin main`
