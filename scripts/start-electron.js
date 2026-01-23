const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

// Clean environment
const env = { ...process.env };
if (env.ELECTRON_RUN_AS_NODE) {
    console.log('🧹 [SCRIPT] Removing ELECTRON_RUN_AS_NODE from environment');
    delete env.ELECTRON_RUN_AS_NODE;
}

console.log('🚀 [SCRIPT] Spawning Electron...');
const child = spawn(electron, ['.'], { 
    stdio: 'inherit', 
    env,
    shell: false 
});

child.on('close', (code) => {
    console.log(`🏁 [SCRIPT] Electron exited with code ${code}`);
    process.exit(code);
});
