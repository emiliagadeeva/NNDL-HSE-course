// data-loader.js
class DataLoader {
    constructor() {
        this.data = [];
        this.stores = new Set();
        this.dates = new Set();
        this.processedData = null;
        this.trainTestSplit = 0.8;
    }

    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvText = e.target.result;
                    this.parseCSV(csvText);
                    this.preprocessData();
                    resolve(this.processedData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('File reading failed'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) throw new Error('CSV file is empty or has no data');
        
        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['Store', 'Date', 'Weekly_Sales', 'Holiday_Flag', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'];
        
        for (const header of requiredHeaders) {
            if (!headers.includes(header)) {
                throw new Error(`Missing required column: ${header}`);
            }
        }

        this.data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            if (values.length !== headers.length) continue;

            const row = {};
            headers.forEach((header, index) => {
                let value = values[index].trim();
                if (header === 'Date') {
                    row[header] = value;
                } else {
                    row[header] = parseFloat(value);
                    if (isNaN(row[header])) {
                        throw new Error(`Invalid numeric value in ${header}: ${value}`);
                    }
                }
            });

            this.data.push(row);
            this.stores.add(row.Store);
            this.dates.add(row.Date);
        }

        if (this.data.length === 0) throw new Error('No valid data found in CSV');
        if (this.stores.size < 10) throw new Error('Need data for at least 10 stores');
    }

    preprocessData() {
        // Sort data by date and store
        this.data.sort((a, b) => {
            const dateCompare = new Date(a.Date) - new Date(b.Date);
            return dateCompare !== 0 ? dateCompare : a.Store - b.Store;
        });

        // Group by store and create time series
        const storeData = {};
        this.stores.forEach(store => {
            storeData[store] = this.data
                .filter(row => row.Store === store)
                .sort((a, b) => new Date(a.Date) - new Date(b.Date));
        });

        // Create sequences
        const sequences = [];
        const targets = [];
        const sequenceLength = 12;
        const predictionHorizon = 3;

        // Get common dates across all stores
        const allDates = [...new Set(this.data.map(row => row.Date))].sort();
        
        for (let i = sequenceLength; i < allDates.length - predictionHorizon; i++) {
            const currentDate = allDates[i];
            const sequenceFeatures = [];
            const targetValues = [];

            // Check if we have enough future data
            let hasEnoughData = true;
            for (let store of this.stores) {
                const storeRows = storeData[store];
                const currentIdx = storeRows.findIndex(row => row.Date === currentDate);
                
                if (currentIdx === -1 || currentIdx + predictionHorizon >= storeRows.length) {
                    hasEnoughData = false;
                    break;
                }
            }

            if (!hasEnoughData) continue;

            // Build input sequence (last 12 weeks)
            for (let j = i - sequenceLength; j < i; j++) {
                const date = allDates[j];
                const weekFeatures = [];
                
                for (let store of this.stores) {
                    const storeRow = storeData[store].find(row => row.Date === date);
                    if (storeRow) {
                        weekFeatures.push(
                            storeRow.Weekly_Sales,
                            storeRow.Holiday_Flag,
                            storeRow.Temperature,
                            storeRow.Fuel_Price,
                            storeRow.CPI,
                            storeRow.Unemployment
                        );
                    } else {
                        weekFeatures.push(0, 0, 0, 0, 0, 0);
                    }
                }
                sequenceFeatures.push(weekFeatures);
            }

            // Build targets (next 3 weeks sales for each store)
            for (let offset = 1; offset <= predictionHorizon; offset++) {
                const futureDate = allDates[i + offset];
                for (let store of this.stores) {
                    const futureRow = storeData[store].find(row => row.Date === futureDate);
                    targetValues.push(futureRow ? futureRow.Weekly_Sales : 0);
                }
            }

            sequences.push(sequenceFeatures);
            targets.push(targetValues);
        }

        if (sequences.length === 0) throw new Error('Not enough data to create sequences');

        // Convert to tensors
        const X = tf.tensor3d(sequences);
        const y = tf.tensor2d(targets);

        // Split chronologically
        const splitIndex = Math.floor(sequences.length * this.trainTestSplit);
        const X_train = X.slice([0, 0, 0], [splitIndex, sequenceLength, this.stores.size * 6]);
        const X_test = X.slice([splitIndex, 0, 0], [sequences.length - splitIndex, sequenceLength, this.stores.size * 6]);
        const y_train = y.slice([0, 0], [splitIndex, this.stores.size * predictionHorizon]);
        const y_test = y.slice([splitIndex, 0], [sequences.length - splitIndex, this.stores.size * predictionHorizon]);

        // Clean up
        X.dispose();
        y.dispose();

        this.processedData = {
            X_train,
            X_test,
            y_train,
            y_test,
            stores: Array.from(this.stores),
            sequenceLength,
            predictionHorizon,
            featureCount: this.stores.size * 6
        };

        return this.processedData;
    }

    dispose() {
        if (this.processedData) {
            this.processedData.X_train.dispose();
            this.processedData.X_test.dispose();
            this.processedData.y_train.dispose();
            this.processedData.y_test.dispose();
        }
    }
}

export default DataLoader;
