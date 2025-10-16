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
                Volume: parseFloat(row.Volume)
            };
        }

        this.symbols = Array.from(symbols).sort();
        this.dates = Array.from(dates).sort();
        this.stocksData = data;

        console.log(`Loaded ${this.symbols.length} stocks with ${this.dates.length} trading days`);
    }

    normalizeData() {
        if (!this.stocksData) throw new Error('No data loaded');
        
        this.normalizedData = {};
        
        // Normalize each stock independently
        this.symbols.forEach(symbol => {
            this.normalizedData[symbol] = {};
            
            // Find min and max for this stock
            let minClose = Infinity;
            let maxClose = -Infinity;
            
            this.dates.forEach(date => {
                if (this.stocksData[symbol][date]) {
                    const close = this.stocksData[symbol][date].Close;
                    minClose = Math.min(minClose, close);
                    maxClose = Math.max(maxClose, close);
                }
            });

            // Normalize close prices
            this.dates.forEach(date => {
                if (this.stocksData[symbol][date]) {
                    const close = this.stocksData[symbol][date].Close;
                    this.normalizedData[symbol][date] = {
                        Close: (close - minClose) / (maxClose - minClose)
                    };
                }
            });
        });

        return this.normalizedData;
    }

    createSequences(sequenceLength = 15, predictionHorizon = 3) {
        if (!this.normalizedData) this.normalizeData();

        const sequences = [];
        const targets = [];
        const validDates = [];

        // Limit number of stocks for performance
        const maxStocks = Math.min(this.symbols.length, 10);
        const selectedSymbols = this.symbols.slice(0, maxStocks);

        for (let i = sequenceLength; i < this.dates.length - predictionHorizon; i++) {
            const currentDate = this.dates[i];
            const sequenceData = [];
            let validSequence = true;

            // Create sequence for all selected symbols
            for (let j = sequenceLength - 1; j >= 0; j--) {
                const seqDate = this.dates[i - j];
                const timeStepData = [];

                selectedSymbols.forEach(symbol => {
                    if (this.normalizedData[symbol][seqDate]) {
                        timeStepData.push(this.normalizedData[symbol][seqDate].Close);
                    } else {
                        validSequence = false;
                    }
                });

                if (validSequence) sequenceData.push(timeStepData);
            }

            // Create target - price movement direction
            if (validSequence) {
                const target = [];

                for (let offset = 1; offset <= predictionHorizon; offset++) {
                    const futureDate = this.dates[i + offset];
                    selectedSymbols.forEach(symbol => {
                        if (this.stocksData[symbol][futureDate] && this.stocksData[symbol][currentDate]) {
                            const futureClose = this.stocksData[symbol][futureDate].Close;
                            const currentClose = this.stocksData[symbol][currentDate].Close;
                            
                            // Binary classification: 1 if price goes up, 0 if down
                            const direction = futureClose > currentClose ? 1 : 0;
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

        // Limit dataset size for performance
        const maxSequences = Math.min(sequences.length, 1000);
        const finalSequences = sequences.slice(0, maxSequences);
        const finalTargets = targets.slice(0, maxSequences);

        // Split into train/test (80/20)
        const splitIndex = Math.floor(finalSequences.length * 0.8);
        
        this.X_train = tf.tensor3d(finalSequences.slice(0, splitIndex));
        this.y_train = tf.tensor2d(finalTargets.slice(0, splitIndex));
        this.X_test = tf.tensor3d(finalSequences.slice(splitIndex));
        this.y_test = tf.tensor2d(finalTargets.slice(splitIndex));
        this.testDates = validDates.slice(splitIndex);
        this.symbols = selectedSymbols; // Use only selected symbols

        console.log(`Created ${finalSequences.length} sequences`);
        console.log(`Training: ${this.X_train.shape[0]}, Test: ${this.X_test.shape[0]}`);
        
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
