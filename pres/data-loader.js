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
                    console.log('Data loaded successfully:', {
                        totalRows: this.data.length,
                        stores: this.getAllStores(),
                        sampleData: this.data[0]
                    });
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
        if (lines.length < 2) {
            throw new Error('CSV file is empty or has only headers');
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
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
            
            // Only add row if it has valid store and sales data
            if (row.Store && !isNaN(row.Weekly_Sales)) {
                data.push(row);
            }
        }
        
        return data.sort((a, b) => a.timestamp - b.timestamp);
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    parseDate(dateStr) {
        // Handle DD-MM-YYYY format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            // Try DD-MM-YYYY
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month, day).getTime();
            }
        }
        
        // Fallback to Date constructor
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? Date.now() : date.getTime();
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
            
            // Remove duplicates based on date
            const uniqueData = [];
            const dateSet = new Set();
            
            storeData[storeId].forEach(row => {
                const dateKey = row.Date;
                if (!dateSet.has(dateKey)) {
                    dateSet.add(dateKey);
                    uniqueData.push(row);
                }
            });
            
            storeData[storeId] = uniqueData;
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
            if (storeData.length < windowSize + 3) {
                console.log(`Skipping store ${storeId}: insufficient data (${storeData.length} records)`);
                return;
            }

            for (let i = 0; i < storeData.length - windowSize - 2; i++) {
                const sequence = [];
                for (let j = 0; j < windowSize; j++) {
                    const point = storeData[i + j];
                    const features = this.features.map(feat => {
                        // Normalize features
                        if (feat === 'Weekly_Sales') return point[feat] / 1000000; // Scale sales
                        if (feat === 'Temperature') return point[feat] / 100;
                        if (feat === 'Fuel_Price') return point[feat] / 5;
                        if (feat === 'CPI') return point[feat] / 300;
                        if (feat === 'Unemployment') return point[feat] / 15;
                        return point[feat]; // Holiday_Flag remains as is
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

        if (sequences.length === 0) {
            throw new Error('No sequences generated. Check if stores have enough data.');
        }

        // Split data
        const splitIndex = Math.floor(sequences.length * testSplit);
        
        console.log(`Generated ${sequences.length} sequences, split at ${splitIndex} (${testSplit * 100}% training)`);
        
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
