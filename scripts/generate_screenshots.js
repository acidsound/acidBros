const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function main() {
    // Start http-server
    const server = spawn('npx', ['http-server', '-p', '8080'], {
        stdio: 'pipe',
        shell: true
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const baseUrl = 'http://localhost:8080';

    try {
        console.log('Navigating to app...');
        await page.goto(baseUrl);
        await page.waitForLoadState('networkidle');

        // Allow some time for animations and initialization
        await page.waitForTimeout(2000);

        // Ensure assets directory exists
        const assetsDir = path.join(__dirname, '..', 'assets');
        if (!fs.existsSync(assetsDir)){
            fs.mkdirSync(assetsDir);
        }

        console.log('Taking Desktop Screenshot...');
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.screenshot({ path: path.join(assetsDir, 'screenshot-desktop.png') });

        console.log('Taking Mobile Landscape Screenshot...');
        // iPhone 13 Pro Landscape
        const mobileLandscape = devices['iPhone 13 Pro'];
        const contextLandscape = await browser.newContext({
            ...mobileLandscape,
            viewport: { width: 844, height: 390 },
            isMobile: true
        });
        const pageLandscape = await contextLandscape.newPage();
        await pageLandscape.goto(baseUrl);
        await pageLandscape.waitForLoadState('networkidle');
        await pageLandscape.waitForTimeout(2000);
        await pageLandscape.screenshot({ path: path.join(assetsDir, 'screenshot-mobile-landscape.png') });
        await contextLandscape.close();

        console.log('Taking Mobile Portrait Screenshot...');
        const mobilePortrait = devices['iPhone 13 Pro'];
        const contextPortrait = await browser.newContext({
            ...mobilePortrait,
            isMobile: true
        });
        const pagePortrait = await contextPortrait.newPage();
        await pagePortrait.goto(baseUrl);
        await pagePortrait.waitForLoadState('networkidle');
        await pagePortrait.waitForTimeout(2000);
        await pagePortrait.screenshot({ path: path.join(assetsDir, 'screenshot-mobile-portrait.png') });
        await contextPortrait.close();

        // --- Manual Screenshots ---
        console.log('Taking Manual Screenshots...');
        await page.setViewportSize({ width: 1280, height: 1200 }); // Larger height to fit everything
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // 1. Transport
        const transport = page.locator('.top-bar');
        await transport.screenshot({ path: path.join(assetsDir, 'manual-transport.png') });

        // 2. Mode Switch
        const modeSwitch = page.locator('.mode-switch-group');
        await modeSwitch.screenshot({ path: path.join(assetsDir, 'manual-mode-switch.png') });

        // 3. Copy/Paste Buttons
        // In Pattern Mode
        const patternActions = page.locator('.pattern-actions');
        await patternActions.screenshot({ path: path.join(assetsDir, 'manual-copy-paste.png') });

        // 4. TB-303 Unit
        const tb303 = page.locator('.machine.tb-303').first();
        await tb303.screenshot({ path: path.join(assetsDir, 'manual-tb303.png') });

        // 5. TR-909 Unit
        const tr909 = page.locator('.machine.tr-909');
        await tr909.screenshot({ path: path.join(assetsDir, 'manual-tr909.png') });

        // 6. Piano Roll
        // To open piano roll, we need to click a note display.
        // Looking at styles.css, there is a .step-303 but I don't see a clear "note display" class in HTML structure I inferred.
        // But in JS (not seen), it likely renders note names.
        // Let's click the first step of the first 303 unit.
        // The step structure seems to be .step-303 -> select (maybe?) or just div.
        // The manual says "Click any note display".
        // Let's try to click the element that shows the note name.
        // In CSS: ".step-303 select" exists. And ".step-303" has display flex.
        // If it's a select, Playwright might open the native picker which is not what we want (it says "pop-over note editor").
        // This implies custom UI, not native select.
        // Wait, styles.css has ".piano-overlay" and ".note-editor". This confirms custom UI.
        // How is it triggered?
        // "Click any note display to open the advanced note editor"
        // If I click the step, maybe it opens?
        // Or maybe there is a specific element for note display.
        // I'll try clicking the first .step-303 in the first .sequencer-303.
        const firstStep = page.locator('.machine.tb-303').first().locator('.sequencer-303 .step-303').first();
        // Maybe click the text inside it?
        // Let's just click the step.
        await firstStep.click();

        // Wait for overlay
        try {
             await page.waitForSelector('.piano-overlay', { state: 'visible', timeout: 3000 });
             const pianoOverlay = page.locator('.note-editor'); // Screenshot the editor, not the whole overlay
             await pianoOverlay.screenshot({ path: path.join(assetsDir, 'manual-pianoroll.png') });

             // Close it
             await page.click('.close-btn');
             await page.waitForSelector('.piano-overlay', { state: 'hidden' });
        } catch (e) {
            console.log('Could not open piano roll or take screenshot: ' + e);
        }

        // 7. Settings
        await page.click('#settingsBtn');
        await page.waitForSelector('#settingsPopover', { state: 'visible' });
        await page.waitForTimeout(500);
        const settingsPopover = page.locator('#settingsPopover');
        await settingsPopover.screenshot({ path: path.join(assetsDir, 'manual-settings.png') });

        // Close settings
        await page.click('#settingsCloseBtn');
        await page.waitForTimeout(500);

    } catch (error) {
        console.error('Error taking screenshots:', error);
    } finally {
        await browser.close();
        server.kill();
    }
}

main();
