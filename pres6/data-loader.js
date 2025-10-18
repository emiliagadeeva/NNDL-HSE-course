[file name]: data-loader.js
[file content begin]
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
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length !== headers.length) continue;
            
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

    // 🔥 НОВЫЕ МЕТОДЫ ДЛЯ EDA
    getEDAStats() {
        if (!this.data || this.data.length === 0) return null;

        const stats = {
            totalStores: this.stores.size,
            totalRecords: this.data.length,
            dateRange: this.getDateRange(),
            salesStats: this.getSalesStats(),
            holidayStats: this.getHolidayStats(),
            featureStats: this.getFeatureStats()
        };

        return stats;
    }

    getDateRange() {
        const dates = this.data.map(row => row.timestamp);
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        return {
            start: minDate.toLocaleDateString(),
            end: maxDate.toLocaleDateString(),
            weeks: Math.round((maxDate - minDate) / (7 * 24 * 60 * 60 * 1000))
        };
    }

    getSalesStats() {
        const sales = this.data.map(row => row.Weekly_Sales);
        return {
            total: sales.reduce((a, b) => a + b, 0),
            average: sales.reduce((a, b) => a + b, 0) / sales.length,
            min: Math.min(...sales),
            max: Math.max(...sales),
            median: this.getMedian(sales)
        };
    }

    getHolidayStats() {
        const holidayWeeks = this.data.filter(row => row.Holiday_Flag === 1);
        const nonHolidayWeeks = this.data.filter(row => row.Holiday_Flag === 0);
        
        const holidaySales = holidayWeeks.map(row => row.Weekly_Sales);
        const nonHolidaySales = nonHolidayWeeks.map(row => row.Weekly_Sales);
        
        return {
            holidayWeeks: holidayWeeks.length,
            nonHolidayWeeks: nonHolidayWeeks.length,
            avgHolidaySales: holidaySales.length > 0 ? holidaySales.reduce((a, b) => a + b, 0) / holidaySales.length : 0,
            avgNonHolidaySales: nonHolidaySales.length > 0 ? nonHolidaySales.reduce((a, b) => a + b, 0) / nonHolidaySales.length : 0
        };
    }

    getFeatureStats() {
        const features = ['Temperature', 'Fuel_Price', 'CPI', 'Unemployment'];
        const stats = {};
        
        features.forEach(feature => {
            const values = this.data.map(row => row[feature]).filter(val => !isNaN(val));
            stats[feature] = {
                min: Math.min(...values),
                max: Math.max(...values),
                average: values.reduce((a, b) => a + b, 0) / values.length
            };
        });
        
        return stats;
    }

    getMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    getSalesByStore() {
        const storeSales = {};
        this.stores.forEach(storeId => {
            const storeData = this.getStoreData(storeId);
            const totalSales = storeData.reduce((sum, row) => sum + row.Weekly_Sales, 0);
            storeSales[storeId] = totalSales;
        });
        return storeSales;
    }

    getSalesDistribution() {
        const sales = this.data.map(row => row.Weekly_Sales);
        return this.createHistogramData(sales, 20);
    }

    getSalesTrend() {
        const monthlySales = {};
        this.data.forEach(row => {
            const date = new Date(row.timestamp);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            if (!monthlySales[monthKey]) {
                monthlySales[monthKey] = { total: 0, count: 0 };
            }
            monthlySales[monthKey].total += row.Weekly_Sales;
            monthlySales[monthKey].count += 1;
        });

        const labels = Object.keys(monthlySales).sort();
        const data = labels.map(month => monthlySales[month].total / monthlySales[month].count);
        
        return { labels, data };
    }

    getCorrelationData() {
        const features = ['Weekly_Sales', 'Temperature', 'Fuel_Price', 'CPI', 'Unemployment'];
        const data = {};
        
        features.forEach(feature => {
            data[feature] = this.data.map(row => row[feature]);
        });

        const correlations = {};
        features.forEach(feat1 => {
            correlations[feat1] = {};
            features.forEach(feat2 => {
                if (feat1 !== feat2) {
                    correlations[feat1][feat2] = this.calculateCorrelation(data[feat1], data[feat2]);
                }
            });
        });

        return {
            labels: features,
            datasets: features.map((feat1, i) => ({
                label: feat1,
                data: features.map((feat2, j) => i === j ? 1 : correlations[feat1][feat2] || 0),
                backgroundColor: this.getColorForValue(correlations[feat1][feat2] || 0)
            }))
        };
    }

    calculateCorrelation(x, y) {
        const n = x.length;
        const sum_x = x.reduce((a, b) => a + b, 0);
        const sum_y = y.reduce((a, b) => a + b, 0);
        const sum_xy = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sum_x2 = x.reduce((sum, val) => sum + val * val, 0);
        const sum_y2 = y.reduce((sum, val) => sum + val * val, 0);
        
        const numerator = n * sum_xy - sum_x * sum_y;
        const denominator = Math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    getColorForValue(value) {
        const intensity = Math.abs(value) * 255;
        if (value > 0) {
            return `rgba(0, ${intensity}, 0, 0.7)`;
        } else if (value < 0) {
            return `rgba(${intensity}, 0, 0, 0.7)`;
        }
        return 'rgba(128, 128, 128, 0.7)';
    }

    createHistogramData(data, bins = 10) {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binSize = (max - min) / bins;
        
        const histogram = Array(bins).fill(0);
        const labels = [];
        
        for (let i = 0; i < bins; i++) {
            const binStart = min + i * binSize;
            const binEnd = binStart + binSize;
            labels.push(`${(binStart / 1000).toFixed(0)}k-${(binEnd / 1000).toFixed(0)}k`);
            
            histogram[i] = data.filter(val => val >= binStart && val < binEnd).length;
        }
        
        return { labels, data: histogram };
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

            // Создаем последовательности для каждого магазина
            const storeSequences = [];
            const storeTargets = [];
            
            for (let i = 0; i < storeData.length - windowSize - 2; i++) {
                const sequence = [];
                for (let j = 0; j < windowSize; j++) {
                    const point = storeData[i + j];
                    const features = this.features.map(feat => {
                        // Правильная нормализация
                        if (feat === 'Weekly_Sales') return point[feat] / 1000000;
                        if (feat === 'Temperature') return point[feat] / 100;
                        if (feat === 'Fuel_Price') return point[feat] / 10;
                        if (feat === 'CPI') return point[feat] / 1000;
                        if (feat === 'Unemployment') return point[feat] / 20;
                        return point[feat];
                    });
                    sequence.push(features);
                }
                
                const target = [
                    storeData[i + windowSize].Weekly_Sales / 1000000,
                    storeData[i + windowSize + 1].Weekly_Sales / 1000000,
                    storeData[i + windowSize + 2].Weekly_Sales / 1000000
                ];

                storeSequences.push(sequence);
                storeTargets.push(target);
            }

            // Добавляем все последовательности магазина с его ID
            sequences.push(...storeSequences);
            targets.push(...storeTargets);
            storeIndices.push(...Array(storeSequences.length).fill(storeId));
        });

        if (sequences.length === 0) {
            throw new Error('No sequences generated. Check if stores have enough data.');
        }

        // 🔥 ПЕРЕМЕШИВАНИЕ: Перемешиваем данные перед разделением
        const shuffled = this.shuffleArrays(sequences, targets, storeIndices);
        
        const splitIndex = Math.floor(shuffled.sequences.length * testSplit);
        
        console.log(`Generated ${shuffled.sequences.length} sequences from ${storeIds.length} stores`);
        console.log('Store distribution in test set:', this.countStores(shuffled.storeIndices.slice(splitIndex)));
        
        return {
            trainX: shuffled.sequences.slice(0, splitIndex),
            trainY: shuffled.targets.slice(0, splitIndex),
            testX: shuffled.sequences.slice(splitIndex),
            testY: shuffled.targets.slice(splitIndex),
            storeIndices: shuffled.storeIndices.slice(splitIndex),
            featureNames: this.features
        };
    }

    // 🔥 НОВЫЙ МЕТОД: Перемешивание данных Fisher-Yates
    shuffleArrays(sequences, targets, storeIndices) {
        const indices = Array.from({length: sequences.length}, (_, i) => i);
        
        // Fisher-Yates shuffle algorithm
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        
        return {
            sequences: indices.map(i => sequences[i]),
            targets: indices.map(i => targets[i]),
            storeIndices: indices.map(i => storeIndices[i])
        };
    }

    // 🔥 НОВЫЙ МЕТОД: Подсчет магазинов в наборе данных
    countStores(storeIndices) {
        const count = {};
        storeIndices.forEach(storeId => {
            count[storeId] = (count[storeId] || 0) + 1;
        });
        return count;
    }
}
[file content end]
