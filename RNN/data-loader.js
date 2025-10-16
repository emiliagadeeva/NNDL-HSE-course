class DataLoader {
    constructor() {
        this.stocksData = null;
        this.normalizedData = null;
        this.symbols = [];
        this.dates = [];
        this.X_train = null;
        this.y_train = null;
        this.X_test = null;
        this.y_test = null;
        this.testDates = [];
        this.featureScalers = {};
        this.technicalIndicators = {};
    }

    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csv = e.target.result;
                    this.parseCSV(csv);
                    resolve(this.stocksData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = {};
        const symbols = new Set();
        const dates = new Set();

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) continue;

            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });

            const symbol = row.Symbol;
            const date = row.Date;
            
            symbols.add(symbol);
            dates.add(date);

            if (!data[symbol]) data[symbol] = {};
            data[symbol][date] = {
                Open: parseFloat(row.Open),
                Close: parseFloat(row.Close),
                High: parseFloat(row.High),
                Low: parseFloat(row.Low),
                Volume: parseFloat(row.Volume),
                AdjClose: parseFloat(row.AdjClose || row.Close)
            };
        }

        this.symbols = Array.from(symbols).sort();
        this.dates = Array.from(dates).sort();
        this.stocksData = data;

        console.log(`Loaded ${this.symbols.length} stocks with ${this.dates.length} trading days`);
    }

    calculateTechnicalIndicators() {
        this.technicalIndicators = {};
        
        this.symbols.forEach(symbol => {
            this.technicalIndicators[symbol] = {};
            const dates = this.dates;
            const prices = dates.map(date => this.stocksData[symbol][date].Close);
            const volumes = dates.map(date => this.stocksData[symbol][date].Volume);

            // SMA (Simple Moving Average)
            dates.forEach((date, index) => {
                if (index >= 9) {
                    const sma = prices.slice(index - 9, index + 1).reduce((a, b) => a + b) / 10;
                    this.technicalIndicators[symbol][date] = {
                        ...this.technicalIndicators[symbol][date],
                        SMA: sma
                    };
                }
            });

            // RSI (Relative Strength Index)
            dates.forEach((date, index) => {
                if (index >= 14) {
                    const gains = [];
                    const losses = [];
                    for (let i = index - 13; i <= index; i++) {
                        const change = prices[i] - prices[i - 1];
                        gains.push(change > 0 ? change : 0);
                        losses.push(change < 0 ? -change : 0);
                    }
                    const avgGain = gains.reduce((a, b) => a + b) / 14;
                    const avgLoss = losses.reduce((a, b) => a + b) / 14;
                    const rs = avgGain / avgLoss;
                    const rsi = 100 - (100 / (1 + rs));
                    this.technicalIndicators[symbol][date] = {
                        ...this.technicalIndicators[symbol][date],
                        RSI: rsi
                    };
                }
            });

            // Volume SMA
            dates.forEach((date, index) => {
                if (index >= 4) {
                    const volumeSMA = volumes.slice(index - 4, index + 1).reduce((a, b) => a + b) / 5;
                    this.technicalIndicators[symbol][date] = {
                        ...this.technicalIndicators[symbol][date],
                        VolumeSMA: volumeSMA
                    };
                }
            });
        });
    }

    normalizeData() {
        if (!this.stocksData) throw new Error('No data loaded');
        
        this.calculateTechnicalIndicators();
        this.normalizedData = {};
        this.featureScalers = {};

        const allFeatures = ['Open', 'High', 'Low', 'Close', 'Volume', 'SMA', 'RSI', 'VolumeSMA'];

        // Calculate min-max for each feature across all stocks
        allFeatures.forEach(feature => {
            this.featureScalers[feature] = { min: Infinity, max: -Infinity };
        });

        // First pass: find global min-max
        this.symbols.forEach(symbol => {
            this.dates.forEach(date => {
                if (this.stocksData[symbol][date]) {
                    const point = this.stocksData[symbol][date];
                    const indicators = this.technicalIndicators[symbol][date] || {};
                    
                    ['Open', 'High', 'Low', 'Close', 'Volume'].forEach(feature => {
                        this.featureScalers[feature].min = Math.min(this.featureScalers[feature].min, point[feature]);
                        this.featureScalers[feature].max = Math.max(this.featureScalers[feature].max, point[feature]);
                    });

                    ['SMA', 'RSI', 'VolumeSMA'].forEach(feature => {
                        if (indicators[feature] !== undefined) {
                            this.featureScalers[feature].min = Math.min(this.featureScalers[feature].min, indicators[feature]);
                            this.featureScalers[feature].max = Math.max(this.featureScalers[feature].max, indicators[feature]);
                        }
                    });
                }
            });
        });

        // Second pass: normalize data
        this.symbols.forEach(symbol => {
            this.normalizedData[symbol] = {};
            this.dates.forEach(date => {
                if (this.stocksData[symbol][date]) {
                    const point = this.stocksData[symbol][date];
                    const indicators = this.technicalIndicators[symbol][date] || {};
                    
                    this.normalizedData[symbol][date] = {};
                    
                    // Normalize price and volume data
                    ['Open', 'High', 'Low', 'Close', 'Volume'].forEach(feature => {
                        const scaler = this.featureScalers[feature];
                        this.normalizedData[symbol][date][feature] = 
                            (point[feature] - scaler.min) / (scaler.max - scaler.min);
                    });

                    // Normalize technical indicators
                    ['SMA', 'RSI', 'VolumeSMA'].forEach(feature => {
                        const scaler = this.featureScalers[feature];
                        const value = indicators[feature] || 0;
                        this.normalizedData[symbol][date][feature] = 
                            (value - scaler.min) / (scaler.max - scaler.min);
                    });
                }
            });
        });

        return this.normalizedData;
    }

    createSequences(sequenceLength = 20, predictionHorizon = 3) {
        if (!this.normalizedData) this.normalizeData();

        const sequences = [];
        const targets = [];
        const validDates = [];

        const featureCount = 8; // Open, High, Low, Close, Volume, SMA, RSI, VolumeSMA

        for (let i = sequenceLength; i < this.dates.length - predictionHorizon; i++) {
            const currentDate = this.dates[i];
            const sequenceData = [];
            let validSequence = true;

            // Create sequence for all symbols
            for (let j = sequenceLength - 1; j >= 0; j--) {
                const seqDate = this.dates[i - j];
                const timeStepData = [];

                this.symbols.forEach(symbol => {
                    if (this.normalizedData[symbol][seqDate]) {
                        const features = this.normalizedData[symbol][seqDate];
                        timeStepData.push(
                            features.Open,
                            features.High,
                            features.Low,
                            features.Close,
                            features.Volume,
                            features.SMA || 0,
                            features.RSI || 0,
                            features.VolumeSMA || 0
                        );
                    } else {
                        validSequence = false;
                    }
                });

                if (validSequence) sequenceData.push(timeStepData);
            }

            // Create target - price movement direction
            if (validSequence) {
                const target = [];
                const basePrices = [];

                // Get base prices for comparison
                this.symbols.forEach(symbol => {
                    basePrices.push(this.stocksData[symbol][currentDate].Close);
                });

                // Create targets for prediction horizon
                for (let offset = 1; offset <= predictionHorizon; offset++) {
                    const futureDate = this.dates[i + offset];
                    this.symbols.forEach((symbol, idx) => {
                        if (this.stocksData[symbol][futureDate]) {
                            const futureClose = this.stocksData[symbol][futureDate].Close;
                            // Use 3-class classification: Up, Down, Same
                            const priceChange = ((futureClose - basePrices[idx]) / basePrices[idx]) * 100;
                            let direction;
                            if (priceChange > 1.0) direction = 2; // Strong Up
                            else if (priceChange < -1.0) direction = 0; // Strong Down
                            else direction = 1; // Neutral
                            
                            target.push(direction);
                        } else {
                            validSequence = false;
                        }
                    });
                }

                if (validSequence) {
                    sequences.push(sequenceData);
                    targets.push(target);
                    validDates.push(currentDate);
                }
            }
        }

        // Split into train/test (chronological split)
        const splitIndex = Math.floor(sequences.length * 0.8);
        
        this.X_train = tf.tensor3d(sequences.slice(0, splitIndex));
        this.y_train = tf.tensor2d(targets.slice(0, splitIndex));
        this.X_test = tf.tensor3d(sequences.slice(splitIndex));
        this.y_test = tf.tensor2d(targets.slice(splitIndex));
        this.testDates = validDates.slice(splitIndex);

        console.log(`Created ${sequences.length} sequences`);
        console.log(`Training: ${this.X_train.shape} sequences`);
        console.log(`Test: ${this.X_test.shape} sequences`);
        
        return {
            X_train: this.X_train,
            y_train: this.y_train,
            X_test: this.X_test,
            y_test: this.y_test,
            symbols: this.symbols,
            testDates: this.testDates
        };
    }

    dispose() {
        if (this.X_train) this.X_train.dispose();
        if (this.y_train) this.y_train.dispose();
        if (this.X_test) this.X_test.dispose();
        if (this.y_test) this.y_test.dispose();
    }
}

export default DataLoader;
