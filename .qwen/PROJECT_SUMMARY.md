# Project Summary

## Overall Goal
Fix a bug in the acidBros web-based TB-303/TR-909 synthesizer/sequencer where switching from Song Mode back to Pattern Mode would incorrectly save the current UI parameters (from the pattern being played in the song) to the pattern that was active when entering song mode, causing pattern data corruption.

## Key Knowledge
- **Project Structure**: Web-based audio application using Web Audio API, with separate modules for AudioEngine, UI, Data management, and MIDI
- **Version System**: Service worker (sw.js) and index.html maintain version numbers for cache management, with cache version in sw.js needing to be incremented for updates to take effect
- **Core Issue**: In Song Mode, when switching back to Pattern Mode, the `selectPattern` function would save UI settings to the wrong pattern in the pattern bank
- **Technical Implementation**: The `selectPattern` function in Data.js saves current UI settings to the current pattern before updating the pattern ID, causing incorrect saves during mode transitions
- **Solution Pattern**: Added `skipSave` parameter to `selectPattern` function to prevent inappropriate saving during mode transitions

## Recent Actions
- **[COMPLETED]** Identified root cause: `Data.selectPattern(id)` function saving UI settings to the old `currentPatternId` before updating to new ID during mode switches from song to pattern
- **[COMPLETED]** Modified `Data.selectPattern(id, skipSave = false)` to accept optional parameter that skips saving when set to true
- **[COMPLETED]** Updated UI mode switching logic in `UI.js` to call `Data.selectPattern` with `skipSave=true` when transitioning from song mode to pattern mode
- **[COMPLETED]** Updated version numbers: sw.js CACHE_NAME from 'acidbros-v79' to 'acidbros-v80', verified index.html already showed version v80
- **[COMPLETED]** Updated .agent/PROJECT_CONTEXT.md with changelog entries for v79 and v80 documenting the bug fix
- **[COMPLETED]** Committed changes with message "v80: Fix pattern parameter saving during song mode transitions" and pushed to main branch

## Current Plan
- **[DONE]** Fix song mode to pattern mode parameter saving issue
- **[DONE]** Update version numbers in sw.js and project documentation
- **[DONE]** Update project context documentation with change log
- **[DONE]** Deploy the fix to production (https://acidsound.github.io/acidBros/)
- **[DONE]** Verify the fix resolves the reported issue where song mode patterns were incorrectly modifying pattern mode data

---

## Summary Metadata
**Update time**: 2025-12-07T19:06:53.951Z 
