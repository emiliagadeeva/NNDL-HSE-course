class DataLoader {
    constructor() {
        this.data = null;
        this.processedData = null;
        this.stores = new Set();
        this.features = ['Weekly_Sales', 'Holiday_Flag', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'];
    }

    async loadCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const csv = e.target.result;
                    this.data = this.parseCSV(csv);
                    this.processedData = this.preprocessData(this.data);
                    this.extractStores();
                    resolve(this.processedData);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            
            headers.forEach((header, index) => {
                let value = values[index] ? values[index].trim() : '';
                
                // Convert numeric values
                if (['Weekly_Sales', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'].includes(header)) {
                    value = parseFloat(value) || 0;
                } else if (header === 'Holiday_Flag') {
                    value = parseInt(value) || 0;
                } else if (header === 'Store') {
                    value = parseInt(value) || 0;
                }
                
                row[header] = value;
            });
            
            // Convert date
            if (row.Date) {
                row.timestamp = this.parseDate(row.Date);
            }
            
            data.push(row);
        }
        
        return data.sort((a, b) => a.timestamp - b.timestamp);
    }

    parseDate(dateStr) {
        // Handle DD-MM-YYYY format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        }
        return new Date(dateStr).getTime();
    }

    preprocessData(data) {
        // Group by store and sort by date
        const storeData = {};
        
        data.forEach(row => {
            const storeId = row.Store;
            if (!storeData[storeId]) {
                storeData[storeId] = [];
            }
            storeData[storeId].push(row);
        });

        // Sort each store's data by date
        Object.keys(storeData).forEach(storeId => {
            storeData[storeId].sort((a, b) => a.timestamp - b.timestamp);
        });

        return storeData;
    }

    extractStores() {
        this.stores = new Set(Object.keys(this.processedData));
    }

    getStoreData(storeId) {
        return this.processedData[storeId] || [];
    }

    getAllStores() {
        return Array.from(this.stores).map(id => parseInt(id)).sort((a, b) => a - b);
    }

    getDataPreview(limit = 10) {
        if (!this.data) return [];
        return this.data.slice(0, limit);
    }

    prepareSequences(storeIds, windowSize, testSplit = 0.8) {
        const sequences = [];
        const targets = [];
        const storeIndices = [];

        storeIds.forEach(storeId => {
            const storeData = this.getStoreData(storeId);
            if (storeData.length < windowSize + 3) return;

            for (let i = 0; i < storeData.length - windowSize - 2; i++) {
                const sequence = [];
                for (let j = 0; j < windowSize; j++) {
                    const point = storeData[i + j];
                    const features = this.features.map(feat => {
                        // Normalize features
                        if (feat === 'Weekly_Sales') return point[feat] / 1000000;
                        if (feat === 'Temperature') return point[feat] / 100;
                        if (feat === 'Fuel_Price') return point[feat] / 5;
                        if (feat === 'CPI') return point[feat] / 300;
                        if (feat === 'Unemployment') return point[feat] / 15;
                        return point[feat];
                    });
                    sequence.push(features);
                }
                
                // Target: next 3 weeks of sales
                const target = [
                    storeData[i + windowSize].Weekly_Sales / 1000000,
                    storeData[i + windowSize + 1].Weekly_Sales / 1000000,
                    storeData[i + windowSize + 2].Weekly_Sales / 1000000
                ];

                sequences.push(sequence);
                targets.push(target);
                storeIndices.push(storeId);
            }
        });

        // Split data
        const splitIndex = Math.floor(sequences.length * testSplit);
        
        return {
            trainX: sequences.slice(0, splitIndex),
            trainY: targets.slice(0, splitIndex),
            testX: sequences.slice(splitIndex),
            testY: targets.slice(splitIndex),
            storeIndices: storeIndices.slice(splitIndex),
            featureNames: this.features
        };
    }
}
