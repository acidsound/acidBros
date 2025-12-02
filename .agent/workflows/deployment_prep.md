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
     - Update `Current Version`.
     - Update `Recent Changes` section with a summary of the new features/fixes.
     - Update `Architecture` or `File Structure` if new files were added.

4. **Update User Manual**
   - Edit `USER_MANUAL.md`:
     - Add sections for any new user-facing features.
     - Update screenshots or descriptions if UI has changed.

5. **Update README**
   - Edit `README.md`:
     - Update feature lists or installation instructions if changed.
     - Ensure links to other documentation (like `SYNTH_ARCHITECTURE.md`) are correct.

6. **Final Verification**
   - Ensure all `*.md` files are consistent with the code state.

7. **Commit and Push**
   - `git add .`
   - `git commit -m "[Descriptive Message Summary]"`
   - *Example: `v65: Add MIDI Device Management and improve Learn Mode`*
   - `git push origin main`
