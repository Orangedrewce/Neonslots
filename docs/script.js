document.addEventListener('DOMContentLoaded', () => {
    // Encapsulated all game logic and state into a single object.
    const game = {
        // --- DOM Elements ---
        dom: {},
        // --- Game Configuration ---
        config: {
            SYMBOL_HEIGHT: 100,
            REEL_REPEAT_COUNT: 10,
            REEL_STRIPS: [
                ['🍒','⭐','🔔','🍉','🍊','🍋','🍒','⭐','🔔','🍉','🍊','🍋','🍒','🍒','7️⃣'],
                ['🍒','⭐','🔔','🍉','🍊','🍋','🍒','⭐','🔔','🍉','🍊','🍋','⭐','7️⃣'],
                ['🍒','⭐','🔔','🍉','🍊','🍋','7️⃣','⭐','🔔','🍉','🍊','🍋','🔔','7️⃣']
            ],
            PAYOUT_TABLE: { '🍒': { 3: 10, 2: 2 }, '🍋': { 3: 15 }, '🍊': { 3: 20 }, '🍉': { 3: 25 }, '🔔': { 3: 50 }, '⭐': { 3: 100 }, '7️⃣': { 3: 500 } },
            BET_AMOUNTS: [1, 5, 10, 25, 50],
            GameState: { IDLE: 'IDLE', SPINNING: 'SPINNING', EVALUATING: 'EVALUATING', PAYOUT: 'PAYOUT', NO_WIN: 'NO_WIN', GAME_OVER: 'GAME_OVER' }
        },
        // --- Game State ---
        state: {
            currentState: null, credits: 100, betIndex: 1, currentBet: 5, finalIndices: [],
            winInfo: {}, isAutoSpinning: false, isAudioReady: false, isMuted: false,
            // Stats
            totalSpins: 0, wins: 0, totalWinnings: 0, biggestWin: 0,
        },
        // --- Audio Manager ---
        audioManager: {
            sounds: {},
            init: function() {
                this.sounds.click = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.1 } }).toDestination();
                this.sounds.reelStop = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).toDestination();
                this.sounds.win = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 } }).toDestination();
                this.sounds.noWin = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } }).toDestination();
                this.sounds.gameOver = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 0.2 } }).toDestination();
                this.sounds.spinStart = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } }).toDestination();
            },
            play: function(sound, note, duration = '8n', time) {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                this.sounds[sound].triggerAttackRelease(note, duration, time);
            },
            playWin: function() {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                const now = Tone.now();
                this.sounds.win.triggerAttackRelease(["C4", "E4", "G4"], "8n", now);
                this.sounds.win.triggerAttackRelease(["E4", "G4", "B4"], "8n", now + 0.2);
                this.sounds.win.triggerAttackRelease(["G4", "B4", "D5"], "8n", now + 0.4);
            },
            playSpin: function() {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                const now = Tone.now();
                this.sounds.spinStart.triggerAttackRelease(["C4", "E4", "G4", "C5"], "16n", now);
            }
        },
        // --- Game Methods ---
        init: function() {
            this.cacheDomElements();
            this.dom.reels.forEach((reel, i) => this.setupReel(reel, i));
            this.addEventListeners();
            this.updateDisplays();
            this.setState(this.config.GameState.IDLE);
        },
        cacheDomElements: function() {
            this.dom = {
                reels: [document.getElementById('reel-0'), document.getElementById('reel-1'), document.getElementById('reel-2')],
                spinButton: document.getElementById('spin'),
                restartButton: document.getElementById('restart'),
                autoSpinButton: document.getElementById('auto'),
                betUpButton: document.getElementById('bet-up'),
                betDownButton: document.getElementById('bet-down'),
                messageDisplay: document.getElementById('message'),
                creditsDisplay: document.getElementById('credits'),
                betDisplay: document.getElementById('bet'),
                soundToggleButton: document.getElementById('sound-toggle'),
                soundOnIcon: document.getElementById('sound-on'),
                soundOffIcon: document.getElementById('sound-off'),
                statsToggleButton: document.getElementById('stats-toggle'),
                statsModal: document.getElementById('stats-modal'),
                modalCloseButton: document.getElementById('modal-close'),
                totalSpinsDisplay: document.getElementById('total-spins'),
                totalWinsDisplay: document.getElementById('total-wins'),
                winRateDisplay: document.getElementById('win-rate'),
                biggestWinDisplay: document.getElementById('biggest-win'),
                totalWonDisplay: document.getElementById('total-won'),
            };
        },
        addEventListeners: function() {
            this.dom.spinButton.addEventListener('click', () => {
                this.initAudio();
                if (this.state.currentState === this.config.GameState.IDLE) this.setState(this.config.GameState.SPINNING);
            });
            this.dom.restartButton.addEventListener('click', () => this.restartGame());
            this.dom.autoSpinButton.addEventListener('click', () => this.toggleAutoSpin());
            this.dom.betUpButton.addEventListener('click', () => this.changeBet(1));
            this.dom.betDownButton.addEventListener('click', () => this.changeBet(-1));
            this.dom.soundToggleButton.addEventListener('click', () => this.toggleMute());
            this.dom.statsToggleButton.addEventListener('click', () => this.openStatsModal());
            this.dom.modalCloseButton.addEventListener('click', () => this.closeStatsModal());
            this.dom.statsModal.addEventListener('click', (e) => {
                if (e.target === this.dom.statsModal) this.closeStatsModal();
            });
        },
        initAudio: async function() {
            if (this.state.isAudioReady) return;
            await Tone.start();
            this.audioManager.init();
            this.state.isAudioReady = true;
            console.log("Audio context started.");
        },
        setState: function(newState) {
            this.state.currentState = newState;
            switch (this.state.currentState) {
                case this.config.GameState.IDLE: this.handleIdleState(); break;
                case this.config.GameState.SPINNING: this.handleSpinningState(); break;
                case this.config.GameState.EVALUATING: this.handleEvaluatingState(); break;
                case this.config.GameState.PAYOUT: this.handlePayoutState(); break;
                case this.config.GameState.NO_WIN: this.handleNoWinState(); break;
                case this.config.GameState.GAME_OVER: this.handleGameOverState(); break;
            }
        },
        handleIdleState: function() {
            if (this.state.credits < this.config.BET_AMOUNTS[0]) {
                return this.setState(this.config.GameState.GAME_OVER);
            }
            this.dom.spinButton.style.display = 'inline-block';
            this.dom.restartButton.style.display = 'none';
            this.dom.spinButton.disabled = false;
            this.dom.autoSpinButton.disabled = false;
            this.dom.messageDisplay.className = 'message-display';
            this.clearWinningVisuals();
            this.updateBetButtons();

        },
        handleSpinningState: function() {
            this.state.totalSpins++;
            this.clearWinningVisuals();
            this.audioManager.playSpin();
            this.dom.spinButton.disabled = true;
            this.dom.betUpButton.disabled = true;
            this.dom.betDownButton.disabled = true;
            this.dom.autoSpinButton.disabled = true;
            this.dom.messageDisplay.textContent = 'SPINNING...';
            this.dom.messageDisplay.className = 'message-display';

            if (this.state.credits < this.state.currentBet) {
                this.dom.messageDisplay.textContent = 'NOT ENOUGH CREDITS!';
                this.dom.messageDisplay.className = 'message-display lose';
                if(this.state.isAutoSpinning) this.toggleAutoSpin();
                setTimeout(() => this.setState(this.config.GameState.IDLE), 2000);
                return;
            }

            this.state.credits -= this.state.currentBet;
            this.updateDisplays();
            
            this.state.finalIndices = this.config.REEL_STRIPS.map(strip => Math.floor(Math.random() * strip.length));

            const durations = [3000, 4000, 5000].map(d => d + Math.floor(Math.random() * 1000));
            
            this.dom.reels.forEach((reel, i) => this.spinReel(reel, durations[i], this.state.finalIndices[i]));
            
            setTimeout(() => this.audioManager.play('reelStop', 'C2', '16n'), durations[0]);
            setTimeout(() => this.audioManager.play('reelStop', 'C2', '16n'), durations[1]);
            setTimeout(() => {
                this.audioManager.play('reelStop', 'G2', '16n');
                this.setState(this.config.GameState.EVALUATING);
            }, durations[2]);
        },
        handleEvaluatingState: function() {
            this.dom.messageDisplay.textContent = 'CHECKING...';
            let totalWinnings = 0;
            let winningPositions = [];

            const getSymbol = (reelIndex, symbolIndex) => {
                const strip = this.config.REEL_STRIPS[reelIndex];
                return strip[(symbolIndex + strip.length) % strip.length];
            };

            const visibleGrid = this.state.finalIndices.map((middleIndex, reelIndex) => [
                getSymbol(reelIndex, middleIndex - 1),
                getSymbol(reelIndex, middleIndex),
                getSymbol(reelIndex, middleIndex + 1),
            ]);

            const paylinesToCheck = {
                top:    [visibleGrid[0][0], visibleGrid[1][0], visibleGrid[2][0]],
                middle: [visibleGrid[0][1], visibleGrid[1][1], visibleGrid[2][1]],
                bottom: [visibleGrid[0][2], visibleGrid[1][2], visibleGrid[2][2]],
                diag1:  [visibleGrid[0][0], visibleGrid[1][1], visibleGrid[2][2]],
                diag2:  [visibleGrid[0][2], visibleGrid[1][1], visibleGrid[2][0]],
            };
            
            const paylineCoords = {
                top:    [[0, 0], [1, 0], [2, 0]], middle: [[0, 1], [1, 1], [2, 1]], bottom: [[0, 2], [1, 2], [2, 2]],
                diag1:  [[0, 0], [1, 1], [2, 2]], diag2:  [[0, 2], [1, 1], [2, 0]],
            };

            for (const lineKey in paylinesToCheck) {
                const payout = this.calculatePayout(paylinesToCheck[lineKey], lineKey);
                if (payout > 0) {
                    totalWinnings += payout;
                    const line = paylinesToCheck[lineKey];
                    if (['top','middle','bottom'].includes(lineKey) && line[0] === '🍒' && line[1] === '🍒' && line[0] !== line[2]) {
                        winningPositions.push(paylineCoords[lineKey][0], paylineCoords[lineKey][1]);
                    } else {
                        winningPositions.push(...paylineCoords[lineKey]);
                    }
                }
            }

            if (totalWinnings > 0) {
                this.state.winInfo = { winnings: totalWinnings, winningPositions: [...new Set(winningPositions.map(JSON.stringify))].map(JSON.parse) };
                this.setState(this.config.GameState.PAYOUT);
            } else {
                this.setState(this.config.GameState.NO_WIN);
            }
        },
        calculatePayout: function(line, lineKey) {
            const [s1, s2, s3] = line;
            if (s1 === s2 && s2 === s3) return (this.config.PAYOUT_TABLE[s1]?.[3] || 0) * this.state.currentBet;
            if (['top', 'middle', 'bottom'].includes(lineKey) && s1 === '🍒' && s2 === '🍒') return (this.config.PAYOUT_TABLE['🍒'][2] || 0) * this.state.currentBet;
            return 0;
        },
        handlePayoutState: function() {
            const { winnings, winningPositions } = this.state.winInfo;
            this.state.credits += winnings;
            this.state.wins++;
            this.state.totalWinnings += winnings;
            if (winnings > this.state.biggestWin) {
                this.state.biggestWin = winnings;
            }
            this.dom.messageDisplay.textContent = `WIN! +${winnings}`;
            this.dom.messageDisplay.className = 'message-display win';
            this.audioManager.playWin();
            this.animateWinningSymbols(winningPositions);
            this.updateDisplays();
setTimeout(() => {
                // If auto-spinning, go directly to the next spin after the celebration.
                if (this.state.isAutoSpinning) {
                    this.setState(this.config.GameState.SPINNING);
                } else {
                    // Otherwise, go to idle state as normal for manual play.
                    this.dom.messageDisplay.textContent = 'Press Spin!';
                    this.setState(this.config.GameState.IDLE);
                }
            }, 3000);
        },
        handleNoWinState: function() {
            this.dom.messageDisplay.textContent = 'NO WIN! TRY AGAIN.';
            this.dom.messageDisplay.className = 'message-display lose';
            this.audioManager.play('noWin', 'F#2');
setTimeout(() => {
                // If auto-spinning, the 1.5s "NO WIN" message is the pause.
                if (this.state.isAutoSpinning) {
                    this.setState(this.config.GameState.SPINNING);
                } else {
                    // Otherwise, go to idle state for manual play.
                    this.dom.messageDisplay.textContent = 'Press Spin!';
                    this.setState(this.config.GameState.IDLE);
                }
            }, 1500);
        },
        handleGameOverState: function() {
            this.dom.messageDisplay.textContent = 'GAME OVER';
            this.dom.messageDisplay.className = 'message-display lose';
            this.audioManager.play('gameOver', 'C2', '1s');
            if (this.state.isAutoSpinning) this.toggleAutoSpin();
            this.dom.spinButton.style.display = 'none';
            this.dom.restartButton.style.display = 'inline-block';
            this.dom.spinButton.disabled = true;
            this.dom.autoSpinButton.disabled = true;
            this.dom.betUpButton.disabled = true;
            this.dom.betDownButton.disabled = true;
        },
        setupReel: function(reel, reelIndex) {
            reel.innerHTML = '';
            const fragment = document.createDocumentFragment();
            const strip = this.config.REEL_STRIPS[reelIndex];
            for (let i = 0; i < this.config.REEL_REPEAT_COUNT; i++) {
                strip.forEach(symbol => {
                    const symbolDiv = document.createElement('div');
                    symbolDiv.className = 'symbol';
                    symbolDiv.textContent = symbol;
                    fragment.appendChild(symbolDiv);
                });
            }
            reel.appendChild(fragment);
        },
        spinReel: function(reel, duration, finalIndex) {
            const reelIndex = this.dom.reels.indexOf(reel);
            const stripLength = this.config.REEL_STRIPS[reelIndex].length;
            const targetSlot = (this.config.REEL_REPEAT_COUNT - 2) * stripLength + finalIndex;
            const targetPosition = (targetSlot - 1) * this.config.SYMBOL_HEIGHT;
            
            reel.style.transition = 'none';
            reel.style.transform = `translateY(0px)`;
            reel.offsetHeight; // Force reflow
            reel.style.transition = `transform ${duration / 1000}s cubic-bezier(0.25, 1, 0.5, 1)`;
            reel.style.transform = `translateY(-${targetPosition}px)`;
        },
        animateWinningSymbols: function(positions) {
            positions.forEach(([reelIndex, rowIndex]) => {
                const reel = this.dom.reels[reelIndex];
                const stripLength = this.config.REEL_STRIPS[reelIndex].length;
                const domSymbolIndex = (this.config.REEL_REPEAT_COUNT - 2) * stripLength + this.state.finalIndices[reelIndex] + (rowIndex - 1);
                if (reel.children[domSymbolIndex]) {
                    reel.children[domSymbolIndex].classList.add('winning');
                }
            });
        },
        clearWinningVisuals: function() {
            document.querySelectorAll('.symbol.winning').forEach(s => s.classList.remove('winning'));
        },
        updateDisplays: function() {
            this.dom.creditsDisplay.textContent = this.state.credits;
            this.dom.betDisplay.textContent = this.state.currentBet;
            if (this.state.currentState === this.config.GameState.IDLE) this.updateBetButtons();
        },
        updateBetButtons: function() {
            this.dom.betDownButton.disabled = (this.state.betIndex === 0);
            const nextBetIndex = this.state.betIndex + 1;
            this.dom.betUpButton.disabled = (nextBetIndex >= this.config.BET_AMOUNTS.length || this.config.BET_AMOUNTS[nextBetIndex] > this.state.credits);
        },
        changeBet: function(direction) {
            if (this.state.currentState !== this.config.GameState.IDLE) return;
            this.audioManager.play('click', 'C4', '16n');
            if(this.state.isAutoSpinning) this.toggleAutoSpin();
            const newIndex = this.state.betIndex + direction;
            if (newIndex >= 0 && newIndex < this.config.BET_AMOUNTS.length) {
                this.state.betIndex = newIndex;
                this.state.currentBet = this.config.BET_AMOUNTS[this.state.betIndex];
                this.updateDisplays();
            }
        },
        toggleAutoSpin: function() {
            this.initAudio();
            this.state.isAutoSpinning = !this.state.isAutoSpinning;
            this.audioManager.play('click', this.state.isAutoSpinning ? 'E4' : 'A3', '16n');
            this.dom.autoSpinButton.textContent = this.state.isAutoSpinning ? 'STOP' : 'AUTO';
            this.dom.autoSpinButton.classList.toggle('active', this.state.isAutoSpinning);
            if (this.state.isAutoSpinning && this.state.currentState === this.config.GameState.IDLE) {
                this.setState(this.config.GameState.SPINNING);
            }
        },
        toggleMute: function() {
            this.initAudio();
            this.state.isMuted = !this.state.isMuted;
            this.dom.soundOnIcon.style.display = this.state.isMuted ? 'none' : 'block';
            this.dom.soundOffIcon.style.display = this.state.isMuted ? 'block' : 'none';
            this.audioManager.play('click', this.state.isMuted ? 'A3' : 'E4', '16n');
        },
        openStatsModal: function() {
            this.initAudio();
            this.audioManager.play('click', 'A4', '16n');
            this.updateStatsDisplay();
            this.dom.statsModal.classList.remove('hidden');
        },
        closeStatsModal: function() {
            this.audioManager.play('click', 'G4', '16n');
            this.dom.statsModal.classList.add('hidden');
        },
        updateStatsDisplay: function() {
            const { totalSpins, wins, biggestWin, totalWinnings } = this.state;
            const winRate = totalSpins > 0 ? ((wins / totalSpins) * 100).toFixed(1) : 0;
            this.dom.totalSpinsDisplay.textContent = totalSpins;
            this.dom.totalWinsDisplay.textContent = wins;
            this.dom.winRateDisplay.textContent = `${winRate}%`;
            this.dom.biggestWinDisplay.textContent = biggestWin;
            this.dom.totalWonDisplay.textContent = totalWinnings;
        },
        restartGame: function() {
            this.initAudio();
            this.state.credits = 100;
            this.state.betIndex = 1;
            this.state.currentBet = this.config.BET_AMOUNTS[this.state.betIndex];
            this.state.totalSpins = 0;
            this.state.wins = 0;
            this.state.totalWinnings = 0;
            this.state.biggestWin = 0;
            this.audioManager.play('click', 'G4', '8n');
            if (this.state.isAutoSpinning) this.toggleAutoSpin();
            this.updateDisplays();
            this.dom.messageDisplay.textContent = 'Press Spin to Start';
            this.setState(this.config.GameState.IDLE);
        },
    };
    game.init();
});
