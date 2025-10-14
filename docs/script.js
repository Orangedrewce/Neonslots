document.addEventListener('DOMContentLoaded', () => {
    // Encapsulated all game logic and state into a single object with proper FSM
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
            PAYOUT_TABLE: { 
                '🍒': { 3: 10, 2: 2 }, 
                '🍋': { 3: 15 }, 
                '🍊': { 3: 20 }, 
                '🍉': { 3: 25 }, 
                '🔔': { 3: 50 }, 
                '⭐': { 3: 100 }, 
                '7️⃣': { 3: 500 } 
            },
            BET_AMOUNTS: [1, 5, 10, 25, 50, 100, 500, 1000, 5000],
            
            // Animation timings (all in milliseconds)
            TIMING: {
                REEL_SPIN_BASE: 3000,        // Base spin duration for first reel
                REEL_SPIN_INCREMENT: 1000,   // Additional time for each subsequent reel
                REEL_STOP_DELAY: 100,        // Delay between reel stops
                WIN_CELEBRATION: 2500,       // How long to show win animations
                NO_WIN_DISPLAY: 1500,        // How long to show "NO WIN" message
                MESSAGE_GLITCH: 400,         // Duration of message glitch animation
                STATE_TRANSITION: 100        // Small delay for clean state transitions
            },
            
            GameState: { 
                IDLE: 'IDLE', 
                SPINNING: 'SPINNING', 
                STOPPING: 'STOPPING',
                EVALUATING: 'EVALUATING', 
                WIN_CELEBRATION: 'WIN_CELEBRATION',
                NO_WIN_DISPLAY: 'NO_WIN_DISPLAY', 
                GAME_OVER: 'GAME_OVER' 
            }
        },
        
        // --- Game State ---
        state: {
            currentState: null, 
            credits: 100, 
            betIndex: 1, 
            currentBet: 5, 
            finalIndices: [],
            winInfo: {}, 
            isAutoSpinning: false, 
            isAudioReady: false, 
            isMuted: false,
            
            // Animation control
            animationTimeouts: [],
            reelsSpinning: 0,
            
            // Stats
            totalSpins: 0, 
            wins: 0, 
            totalWinnings: 0, 
            biggestWin: 0
        },
        
        // --- Audio Manager ---
        audioManager: {
            sounds: {},
            init: function() {
                this.sounds.click = new Tone.Synth({ 
                    oscillator: { type: 'triangle' }, 
                    envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.1 } 
                }).toDestination();
                
                this.sounds.reelStop = new Tone.MembraneSynth({ 
                    pitchDecay: 0.01, 
                    octaves: 2, 
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0 } 
                }).toDestination();
                
                this.sounds.win = new Tone.PolySynth(Tone.Synth, { 
                    oscillator: { type: "sine" }, 
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 } 
                }).toDestination();
                
                this.sounds.noWin = new Tone.Synth({ 
                    oscillator: { type: 'square' }, 
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } 
                }).toDestination();
                
                this.sounds.gameOver = new Tone.Synth({ 
                    oscillator: { type: 'sawtooth' }, 
                    envelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 0.2 } 
                }).toDestination();
                
                this.sounds.spinStart = new Tone.PolySynth(Tone.Synth, { 
                    oscillator: { type: 'triangle' }, 
                    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 } 
                }).toDestination();
            },
            
            play: function(sound, note, duration = '8n', time) {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                try {
                    if (this.sounds[sound]) {
                        this.sounds[sound].triggerAttackRelease(note, duration, time);
                    }
                } catch (error) {
                    console.error("Audio playback error:", error);
                }
            },
            
            playWin: function() {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                try {
                    if (this.sounds.win) {
                        const now = Tone.now();
                        this.sounds.win.triggerAttackRelease(["C4", "E4", "G4"], "8n", now);
                        this.sounds.win.triggerAttackRelease(["E4", "G4", "B4"], "8n", now + 0.2);
                        this.sounds.win.triggerAttackRelease(["G4", "B4", "D5"], "8n", now + 0.4);
                    }
                } catch (error) {
                    console.error("Win audio playback error:", error);
                }
            },
            
            playSpin: function() {
                if (!game.state.isAudioReady || game.state.isMuted) return;
                try {
                    if (this.sounds.spinStart) {
                        const now = Tone.now();
                        this.sounds.spinStart.triggerAttackRelease(["C4", "E4", "G4", "C5"], "16n", now);
                    }
                } catch (error) {
                    console.error("Spin audio playback error:", error);
                }
            }
        },
        
        // --- Utility Methods ---
        clearAllTimeouts: function() {
            this.state.animationTimeouts.forEach(timeout => clearTimeout(timeout));
            this.state.animationTimeouts = [];
        },
        
        addTimeout: function(callback, delay) {
            const timeoutId = setTimeout(() => {
                // Remove this timeout from the list when it executes
                this.state.animationTimeouts = this.state.animationTimeouts.filter(id => id !== timeoutId);
                callback();
            }, delay);
            this.state.animationTimeouts.push(timeoutId);
            return timeoutId;
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
            // Debounce spin button to prevent rapid clicks
            let spinDebounce = false;
            this.dom.spinButton.addEventListener('click', () => {
                if (spinDebounce) return;
                spinDebounce = true;
                setTimeout(() => { spinDebounce = false; }, 300);
                
                this.initAudio();
                if (this.state.currentState === this.config.GameState.IDLE) {
                    this.setState(this.config.GameState.SPINNING);
                }
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
            try {
                await Tone.start();
                this.audioManager.init();
                this.state.isAudioReady = true;
                console.log("Audio context started.");
            } catch (error) {
                console.error("Failed to initialize audio:", error);
                this.state.isAudioReady = false;
            }
        },
        
        // --- State Machine Core ---
        setState: function(newState) {
            // Clear any pending animations from previous state
            this.clearAllTimeouts();
            
            console.log(`State transition: ${this.state.currentState} -> ${newState}`);
            this.state.currentState = newState;
            
            // Execute state-specific logic
            switch (this.state.currentState) {
                case this.config.GameState.IDLE: 
                    this.handleIdleState(); 
                    break;
                case this.config.GameState.SPINNING: 
                    this.handleSpinningState(); 
                    break;
                case this.config.GameState.STOPPING:
                    this.handleStoppingState();
                    break;
                case this.config.GameState.EVALUATING: 
                    this.handleEvaluatingState(); 
                    break;
                case this.config.GameState.WIN_CELEBRATION: 
                    this.handleWinCelebrationState(); 
                    break;
                case this.config.GameState.NO_WIN_DISPLAY: 
                    this.handleNoWinDisplayState(); 
                    break;
                case this.config.GameState.GAME_OVER: 
                    this.handleGameOverState(); 
                    break;
            }
        },
        
        // --- State Handlers ---
        handleIdleState: function() {
            // Check if game should be over
            if (this.state.credits < this.config.BET_AMOUNTS[0]) {
                return this.setState(this.config.GameState.GAME_OVER);
            }
            
            // Reset UI for new spin
            this.dom.spinButton.style.display = 'inline-block';
            this.dom.restartButton.style.display = 'none';
            this.dom.spinButton.disabled = false;
            this.dom.autoSpinButton.disabled = false;
            this.dom.messageDisplay.className = 'message-display';
            this.dom.messageDisplay.textContent = 'Press Spin!';
            
            // Clear any residual winning animations
            this.clearWinningVisuals();
            this.updateBetButtons();
            
            // Auto-spin logic
            if (this.state.isAutoSpinning) {
                this.addTimeout(() => {
                    // Double-check state and auto-spin status before transitioning
                    if (this.state.currentState === this.config.GameState.IDLE && 
                        this.state.isAutoSpinning && 
                        this.state.credits >= this.state.currentBet) {
                        this.setState(this.config.GameState.SPINNING);
                    }
                }, 500); // Brief pause between auto-spins
            }
        },
        
        handleSpinningState: function() {
            // Validate bet and credits
            if (this.state.credits < this.state.currentBet) {
                this.dom.messageDisplay.textContent = 'NOT ENOUGH CREDITS!';
                this.dom.messageDisplay.className = 'message-display lose';
                if (this.state.isAutoSpinning) this.toggleAutoSpin();
                
                this.addTimeout(() => {
                    this.setState(this.config.GameState.IDLE);
                }, 2000);
                return;
            }
            
            // Increment spin counter and deduct bet
            this.state.totalSpins++;
            this.state.credits = Math.max(0, this.state.credits - this.state.currentBet);
            this.updateDisplays();
            
            // Disable controls during spin
            this.dom.spinButton.disabled = true;
            this.dom.betUpButton.disabled = true;
            this.dom.betDownButton.disabled = true;
            this.dom.messageDisplay.textContent = 'SPINNING...';
            this.dom.messageDisplay.className = 'message-display';
            
            // Clear previous winning visuals
            this.clearWinningVisuals();
            
            // Play spin sound
            this.audioManager.playSpin();
            
            // Generate final positions for reels
            this.state.finalIndices = this.config.REEL_STRIPS.map(strip => 
                Math.floor(Math.random() * strip.length)
            );
            
            // Calculate spin durations with stagger
            const durations = this.dom.reels.map((_, i) => 
                this.config.TIMING.REEL_SPIN_BASE + (i * this.config.TIMING.REEL_SPIN_INCREMENT) + 
                Math.floor(Math.random() * 1000)
            );
            
            // Start spinning all reels
            this.state.reelsSpinning = this.dom.reels.length;
            this.dom.reels.forEach((reel, i) => {
                this.spinReel(reel, durations[i], this.state.finalIndices[i]);
                
                // Schedule reel stop sound and tracking
                this.addTimeout(() => {
                    // Verify we're still in spinning state
                    if (this.state.currentState !== this.config.GameState.SPINNING) return;
                    
                    this.audioManager.play('reelStop', i === 2 ? 'G2' : 'C2', '16n');
                    this.state.reelsSpinning--;
                    
                    // When all reels have stopped, move to stopping state
                    if (this.state.reelsSpinning === 0) {
                        this.addTimeout(() => {
                            // Double-check we're still spinning
                            if (this.state.currentState === this.config.GameState.SPINNING) {
                                this.setState(this.config.GameState.STOPPING);
                            }
                        }, this.config.TIMING.STATE_TRANSITION);
                    }
                }, durations[i]);
            });
        },
        
        handleStoppingState: function() {
            // Brief pause to let reels settle, then evaluate
            this.dom.messageDisplay.textContent = 'CHECKING...';
            
            this.addTimeout(() => {
                // Verify we're still in stopping state
                if (this.state.currentState === this.config.GameState.STOPPING) {
                    this.setState(this.config.GameState.EVALUATING);
                }
            }, this.config.TIMING.STATE_TRANSITION);
        },
        
        handleEvaluatingState: function() {
            let totalWinnings = 0;
            let winningPositions = [];

            // Validate finalIndices
            if (!this.state.finalIndices || this.state.finalIndices.length !== 3) {
                console.error('Invalid finalIndices:', this.state.finalIndices);
                this.setState(this.config.GameState.NO_WIN_DISPLAY);
                return;
            }

            const getSymbol = (reelIndex, symbolIndex) => {
                if (reelIndex < 0 || reelIndex >= this.config.REEL_STRIPS.length) {
                    console.error('Invalid reelIndex:', reelIndex);
                    return '❓';
                }
                const strip = this.config.REEL_STRIPS[reelIndex];
                if (!strip || strip.length === 0) {
                    console.error('Invalid strip:', reelIndex);
                    return '❓';
                }
                return strip[(symbolIndex + strip.length) % strip.length];
            };

            // Build visible grid
            const visibleGrid = this.state.finalIndices.map((middleIndex, reelIndex) => [
                getSymbol(reelIndex, middleIndex - 1),
                getSymbol(reelIndex, middleIndex),
                getSymbol(reelIndex, middleIndex + 1),
            ]);

            // Define paylines
            const paylinesToCheck = {
                top:    [visibleGrid[0][0], visibleGrid[1][0], visibleGrid[2][0]],
                middle: [visibleGrid[0][1], visibleGrid[1][1], visibleGrid[2][1]],
                bottom: [visibleGrid[0][2], visibleGrid[1][2], visibleGrid[2][2]],
                diag1:  [visibleGrid[0][0], visibleGrid[1][1], visibleGrid[2][2]],
                diag2:  [visibleGrid[0][2], visibleGrid[1][1], visibleGrid[2][0]],
            };
            
            const paylineCoords = {
                top:    [[0, 0], [1, 0], [2, 0]], 
                middle: [[0, 1], [1, 1], [2, 1]], 
                bottom: [[0, 2], [1, 2], [2, 2]],
                diag1:  [[0, 0], [1, 1], [2, 2]], 
                diag2:  [[0, 2], [1, 1], [2, 0]],
            };

            // Check each payline for wins
            for (const lineKey in paylinesToCheck) {
                const payout = this.calculatePayout(paylinesToCheck[lineKey], lineKey);
                if (payout > 0) {
                    totalWinnings += payout;
                    const line = paylinesToCheck[lineKey];
                    
                    // Special case for cherry 2-symbol wins (only first two positions)
                    if (['top','middle','bottom'].includes(lineKey) && 
                        line[0] === '🍒' && line[1] === '🍒' && line[0] !== line[2]) {
                        winningPositions.push(paylineCoords[lineKey][0], paylineCoords[lineKey][1]);
                    } else {
                        winningPositions.push(...paylineCoords[lineKey]);
                    }
                }
            }

            // Store win information and transition to appropriate state
            if (totalWinnings > 0) {
                this.state.winInfo = { 
                    winnings: totalWinnings, 
                    winningPositions: [...new Set(winningPositions.map(JSON.stringify))].map(JSON.parse) 
                };
                this.setState(this.config.GameState.WIN_CELEBRATION);
            } else {
                this.setState(this.config.GameState.NO_WIN_DISPLAY);
            }
        },
        
        calculatePayout: function(line, lineKey) {
            const [s1, s2, s3] = line;
            
            // Three of a kind
            if (s1 === s2 && s2 === s3) {
                return (this.config.PAYOUT_TABLE[s1]?.[3] || 0) * this.state.currentBet;
            }
            
            // Two cherries (only on horizontal lines)
            if (['top', 'middle', 'bottom'].includes(lineKey) && s1 === '🍒' && s2 === '🍒') {
                return (this.config.PAYOUT_TABLE['🍒'][2] || 0) * this.state.currentBet;
            }
            
            return 0;
        },
        
        handleWinCelebrationState: function() {
            const { winnings, winningPositions } = this.state.winInfo;
            
            // Update game state
            this.state.credits += winnings;
            this.state.wins++;
            this.state.totalWinnings += winnings;
            if (winnings > this.state.biggestWin) {
                this.state.biggestWin = winnings;
            }
            
            // Update UI
            this.dom.messageDisplay.textContent = `WIN! +${winnings}`;
            this.dom.messageDisplay.className = 'message-display win';
            this.updateDisplays();
            
            // Play win sound and start visual effects
            this.audioManager.playWin();
            this.animateWinningSymbols(winningPositions);
            
            // Schedule transition back to idle/spinning
            this.addTimeout(() => {
                // Verify we're still in win celebration state
                if (this.state.currentState !== this.config.GameState.WIN_CELEBRATION) return;
                
                this.clearWinningVisuals();
                
                if (this.state.isAutoSpinning && this.state.credits >= this.state.currentBet) {
                    this.setState(this.config.GameState.SPINNING);
                } else {
                    this.setState(this.config.GameState.IDLE);
                }
            }, this.config.TIMING.WIN_CELEBRATION);
        },
        
        handleNoWinDisplayState: function() {
            this.dom.messageDisplay.textContent = 'NO WIN! TRY AGAIN.';
            this.dom.messageDisplay.className = 'message-display lose';
            this.audioManager.play('noWin', 'F#2');
            
            // Schedule transition back to idle/spinning
            this.addTimeout(() => {
                // Verify we're still in no win display state
                if (this.state.currentState !== this.config.GameState.NO_WIN_DISPLAY) return;
                
                if (this.state.isAutoSpinning && this.state.credits >= this.state.currentBet) {
                    this.setState(this.config.GameState.SPINNING);
                } else {
                    this.setState(this.config.GameState.IDLE);
                }
            }, this.config.TIMING.NO_WIN_DISPLAY);
        },
        
        handleGameOverState: function() {
            this.dom.messageDisplay.textContent = 'GAME OVER';
            this.dom.messageDisplay.className = 'message-display lose';
            this.audioManager.play('gameOver', 'C2', '1s');
            
            // Stop auto-spin if active
            if (this.state.isAutoSpinning) this.toggleAutoSpin();
            
            // Update UI for game over
            this.dom.spinButton.style.display = 'none';
            this.dom.restartButton.style.display = 'inline-block';
            this.dom.spinButton.disabled = true;
            this.dom.autoSpinButton.disabled = true;
            this.dom.betUpButton.disabled = true;
            this.dom.betDownButton.disabled = true;
        },
        
        // --- Reel and Animation Methods ---
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
            if (!reel) {
                console.error('Invalid reel element');
                return;
            }
            
            const reelIndex = this.dom.reels.indexOf(reel);
            if (reelIndex === -1) {
                console.error('Reel not found in reels array');
                return;
            }
            
            const stripLength = this.config.REEL_STRIPS[reelIndex].length;
            
            // Validate finalIndex
            const validFinalIndex = Math.max(0, Math.min(finalIndex, stripLength - 1));
            if (validFinalIndex !== finalIndex) {
                console.warn(`Invalid finalIndex ${finalIndex}, clamped to ${validFinalIndex}`);
            }
            
            const targetSlot = (this.config.REEL_REPEAT_COUNT - 2) * stripLength + validFinalIndex;
            const targetPosition = (targetSlot - 1) * this.config.SYMBOL_HEIGHT;
            
            // Reset and start spin animation
            reel.style.transition = 'none';
            reel.style.transform = `translateY(0px)`;
            reel.offsetHeight; // Force reflow
            reel.style.transition = `transform ${duration / 1000}s cubic-bezier(0.25, 1, 0.5, 1)`;
            reel.style.transform = `translateY(-${targetPosition}px)`;
        },
        
        animateWinningSymbols: function(positions) {
            positions.forEach(([reelIndex, rowIndex]) => {
                // Bounds check to prevent accessing invalid indices
                if (reelIndex < 0 || reelIndex >= this.dom.reels.length) return;
                if (rowIndex < 0 || rowIndex > 2) return;
                
                const reel = this.dom.reels[reelIndex];
                if (!reel) return;
                
                const stripLength = this.config.REEL_STRIPS[reelIndex].length;
                const domSymbolIndex = (this.config.REEL_REPEAT_COUNT - 2) * stripLength + 
                                     this.state.finalIndices[reelIndex] + (rowIndex - 1);
                
                // Bounds check for DOM children
                if (domSymbolIndex >= 0 && domSymbolIndex < reel.children.length && reel.children[domSymbolIndex]) {
                    reel.children[domSymbolIndex].classList.add('winning');
                }
            });
        },
        
        clearWinningVisuals: function() {
            document.querySelectorAll('.symbol.winning').forEach(s => s.classList.remove('winning'));
        },
        
        // --- UI Update Methods ---
        updateDisplays: function() {
            this.dom.creditsDisplay.textContent = this.state.credits;
            this.dom.betDisplay.textContent = this.state.currentBet;
            if (this.state.currentState === this.config.GameState.IDLE) {
                this.updateBetButtons();
            }
        },
        
        updateBetButtons: function() {
            this.dom.betDownButton.disabled = (this.state.betIndex === 0);
            const nextBetIndex = this.state.betIndex + 1;
            this.dom.betUpButton.disabled = (nextBetIndex >= this.config.BET_AMOUNTS.length || 
                                           this.config.BET_AMOUNTS[nextBetIndex] > this.state.credits);
        },
        
        // --- User Interaction Methods ---
        changeBet: function(direction) {
            if (this.state.currentState !== this.config.GameState.IDLE) return;
            
            this.audioManager.play('click', 'C4', '16n');
            if (this.state.isAutoSpinning) this.toggleAutoSpin();
            
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
            
            // Start auto-spinning if we're in idle state
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
            if (this.dom.statsModal) {
                this.dom.statsModal.classList.add('hidden');
            }
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
            
            // Clear all animations and timeouts
            this.clearAllTimeouts();
            this.clearWinningVisuals();
            
            // Reset game state
            this.state.credits = 100;
            this.state.betIndex = 1;
            this.state.currentBet = this.config.BET_AMOUNTS[this.state.betIndex];
            this.state.totalSpins = 0;
            this.state.wins = 0;
            this.state.totalWinnings = 0;
            this.state.biggestWin = 0;
            this.state.reelsSpinning = 0;
            
            this.audioManager.play('click', 'G4', '8n');
            
            // Stop auto-spin if active
            if (this.state.isAutoSpinning) this.toggleAutoSpin();
            
            // Update displays and go to idle
            this.updateDisplays();
            this.dom.messageDisplay.textContent = 'Press Spin to Start';
            this.setState(this.config.GameState.IDLE);
        }
    };
    
    // Initialize the game
    game.init();
    
    // ===== RAYMARCHED SHADER BACKGROUND =====
    (function initBackground() {
        const canvas = document.getElementById('background-canvas');
        if (!canvas) {
            console.error('Canvas not found');
            return;
        }
        
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            console.error('WebGL not supported, falling back to solid color');
            canvas.style.background = 'linear-gradient(180deg, #0a0a0a 0%, #1a0520 100%)';
            return;
        }
        
        console.log('WebGL initialized successfully');
    
    // Enable the extension needed for fwidth
    const ext = gl.getExtension('OES_standard_derivatives');
    if (!ext) {
        console.error('OES_standard_derivatives not supported');
        canvas.style.background = 'linear-gradient(180deg, #0a0a0a 0%, #1a0520 100%)';
        return;
    }
    console.log('OES_standard_derivatives extension enabled');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let mouseX = 0;
    let mouseY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseDown = false;
    let cameraAngleX = Math.atan(1.0) * 8.0 * (3.9 / 8.0); // tau * (3.9 / 8.0)
    let cameraAngleY = Math.atan(1.0) * 8.0 * (1.4 / 8.0); // tau * (1.4 / 8.0)
    let autoRotate = true;
    let startTime = Date.now();
    
    console.log('Canvas size:', width, 'x', height);
    
    // Handle resize
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        gl.viewport(0, 0, width, height);
    });
    
    // Track mouse click and drag
    canvas.addEventListener('mousedown', (e) => {
        mouseDown = true;
        autoRotate = false;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mouseup', () => {
        mouseDown = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
        mouseDown = false;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (mouseDown) {
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            
            // Update camera angles based on mouse movement
                cameraAngleX -= deltaX * 0.005; // Invert pan
                cameraAngleY -= deltaY * 0.005; // Invert pitch
            
            // Clamp Y angle to prevent flipping
            const tau = Math.atan(1.0) * 8.0;
            cameraAngleY = Math.max(0.0, Math.min(15.5 * tau / 64.0, cameraAngleY));
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });
    
    // Vertex shader
    const vertexShaderSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;
    
    // Fragment shader - your raymarching scene
    const fragmentShaderSource = `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        uniform vec2 iResolution;
        uniform float iTime;
        uniform vec4 iMouse;
        
        #define MIN_DIST 0.001
        #define MAX_DIST 32.0
        #define MAX_STEPS 96
        #define STEP_MULT 0.9
        #define NORMAL_OFFS 0.01
        #define FOCAL_LENGTH 0.8
        
        #define GRID_COLOR_1 vec3(0.00, 0.05, 0.20)
        #define GRID_COLOR_2 vec3(1.00, 0.20, 0.60)
        
        #define GRID_SIZE 0.20
        #define GRID_LINE_SIZE 1.25
        
        #define SKYDOME 0.0
        #define FLOOR 1.0
        
        float pi = atan(1.0) * 4.0;
        float tau = atan(1.0) * 8.0;
        
        struct MarchResult {
            vec3 position;
            vec3 normal;
            float dist;
            float steps;
            float id;
        };
        
        mat3 Rotate(vec3 angles) {
            vec3 c = cos(angles);
            vec3 s = sin(angles);
            
            mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, c.x, s.x, 0.0, -s.x, c.x);
            mat3 rotY = mat3(c.y, 0.0, -s.y, 0.0, 1.0, 0.0, s.y, 0.0, c.y);
            mat3 rotZ = mat3(c.z, s.z, 0.0, -s.z, c.z, 0.0, 0.0, 0.0, 1.0);
            
            return rotX * rotY * rotZ;
        }
        
        vec2 opU(vec2 d1, vec2 d2) {
            return (d1.x < d2.x) ? d1 : d2;
        }
        
        vec2 sdSphere(vec3 p, float s, float id) {
            return vec2(length(p) - s, id);
        }
        
        vec2 sdPlane(vec3 p, vec4 n, float id) {
            return vec2(dot(p, n.xyz) + n.w, id);
        }
        
        vec2 heightmapNormal(vec2 p) {
            return vec2(sin(p.x + iTime * 0.25) * 0.15, sin(p.y - iTime * 0.125) * 0.15);
        }
        
        vec2 Scene(vec3 p) {
            vec2 d = vec2(MAX_DIST, SKYDOME);
            d = opU(sdPlane(p, normalize(vec4(heightmapNormal(p.xy), -1.0, 0.0)), FLOOR), d);
            return d;
        }
        
        vec3 Normal(vec3 p) {
            vec3 off = vec3(NORMAL_OFFS, 0.0, 0.0);
            return normalize(vec3(
                Scene(p + off.xyz).x - Scene(p - off.xyz).x,
                Scene(p + off.zxy).x - Scene(p - off.zxy).x,
                Scene(p + off.yzx).x - Scene(p - off.yzx).x
            ));
        }
        
        MarchResult MarchRay(vec3 orig, vec3 dir) {
            float steps = 0.0;
            float dist = 0.0;
            float id = 0.0;
            
            for(int i = 0; i < MAX_STEPS; i++) {
                vec2 object = Scene(orig + dir * dist);
                object = opU(object, -sdSphere(dir * dist, MAX_DIST, SKYDOME));
                dist += object.x * STEP_MULT;
                id = object.y;
                steps += 1.0;
                
                if(abs(object.x) < MIN_DIST * dist) {
                    break;
                }
            }
            
            MarchResult result;
            result.position = orig + dir * dist;
            result.normal = Normal(result.position);
            result.dist = dist;
            result.steps = steps;
            result.id = id;
            
            return result;
        }
        
        vec3 Shade(MarchResult hit, vec3 direction, vec3 camera) {
            vec3 color = vec3(0.0);
            
            if(hit.id == FLOOR) {
                vec2 uv = abs(mod(hit.position.xy + GRID_SIZE / 2.0, GRID_SIZE) - GRID_SIZE / 2.0);
                uv /= fwidth(hit.position.xy);
                float riverEdge = 1.0;
                float gln = min(min(uv.x, uv.y), riverEdge) / GRID_SIZE;
                color = mix(GRID_COLOR_1, GRID_COLOR_2, 1.0 - smoothstep(0.0, GRID_LINE_SIZE / GRID_SIZE, gln));
            }
            
            color *= 1.0 - smoothstep(0.0, MAX_DIST * 0.9, hit.dist);
            return color;
        }
        
        void main() {
            vec2 res = iResolution.xy / iResolution.y;
            vec2 uv = gl_FragCoord.xy / iResolution.y;
            
            // Camera angles are passed directly via iMouse.xy
            vec3 angles = vec3(0.0);
            angles.x = iMouse.x;
            angles.y = iMouse.y;
            angles.z = 0.0;
            
            mat3 rotate = Rotate(angles.yzx);
            vec3 orig = vec3(0.0, 0.0, -2.0) * rotate;
            vec3 dir = normalize(vec3(uv - res / 2.0, FOCAL_LENGTH)) * rotate;
            
            MarchResult hit = MarchRay(orig, dir);
            vec3 color = Shade(hit, dir, orig);
            
            gl_FragColor = vec4(color, 1.0);
        }
    `;
    
    // Compile shader
    function compileShader(source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            console.error('Shader source:', source);
            gl.deleteShader(shader);
            return null;
        }
        console.log('Shader compiled successfully:', type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT');
        return shader;
    }
    
    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    
    if (!vertexShader || !fragmentShader) {
        console.error('Failed to compile shaders');
        return;
    }
    
    // Create program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return;
    }
    
    console.log('WebGL program linked successfully');
    
    // Handle WebGL context loss
    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.warn('WebGL context lost');
        isRendering = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    });
    
    canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored, restarting render');
        isRendering = true;
        render();
    });
    
    gl.useProgram(program);
    
    // Set up geometry (fullscreen quad)
    const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Get uniform locations
    const iResolutionLocation = gl.getUniformLocation(program, 'iResolution');
    const iTimeLocation = gl.getUniformLocation(program, 'iTime');
    const iMouseLocation = gl.getUniformLocation(program, 'iMouse');
    
    // Render loop
    let frameCount = 0;
    let animationFrameId = null;
    let isRendering = true;
    
    function render() {
        if (!isRendering) return;
        
        try {
            const currentTime = (Date.now() - startTime) / 1000.0;
            
            // Auto-rotate if not manually controlled
            if (autoRotate) {
                const tau = Math.atan(1.0) * 8.0;
                cameraAngleX = tau * (3.9 / 8.0) + Math.sin(currentTime * 0.1) * 0.3;
                cameraAngleY = tau * (1.4 / 8.0);
            }
            
            gl.viewport(0, 0, width, height);
            gl.uniform2f(iResolutionLocation, width, height);
            gl.uniform1f(iTimeLocation, currentTime);
            gl.uniform4f(iMouseLocation, cameraAngleX, cameraAngleY, autoRotate ? 0.0 : 1.0, 0);
            
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
            frameCount++;
            if (frameCount === 1) {
                console.log('First frame rendered at time:', currentTime);
            }
            
            animationFrameId = requestAnimationFrame(render);
        } catch (error) {
            console.error('WebGL render error:', error);
            isRendering = false;
        }
    }
    
    // Stop rendering when page is hidden (performance optimization)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            isRendering = false;
        } else {
            isRendering = true;
            render();
        }
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        isRendering = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    });
    
    console.log('Starting render loop...');
    render();
    })(); // Close the initBackground function
});
