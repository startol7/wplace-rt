// グローバル変数
let map;
let territories = new Map();
let currentCountry = 'JP';
let canPlace = true;
let territoryMarkers = null;
let gridLayer = null;
let heatmapLayer = null;
let showGrid = false;
let showHeatmap = false;

// 設定
const GRID_SIZE = 0.5; // 緯度経度のグリッドサイズ（度）
const COOLDOWN_TIME = 5000; // 5秒
const INITIAL_TERRITORIES = 50; // 初期領土数

// 国別設定
const countryData = {
    'JP': { name: '日本', color: '#ff4b4b', flag: '🇯🇵', center: [35.6762, 139.6503] },
    'US': { name: 'アメリカ', color: '#4b8bff', flag: '🇺🇸', center: [40.7128, -74.0060] },
    'CN': { name: '中国', color: '#ffeb3b', flag: '🇨🇳', center: [39.9042, 116.4074] },
    'KR': { name: '韓国', color: '#4bff4b', flag: '🇰🇷', center: [37.5665, 126.9780] },
    'GB': { name: 'イギリス', color: '#ff4bff', flag: '🇬🇧', center: [51.5074, -0.1278] },
    'FR': { name: 'フランス', color: '#4bffff', flag: '🇫🇷', center: [48.8566, 2.3522] },
    'DE': { name: 'ドイツ', color: '#ff8b4b', flag: '🇩🇪', center: [52.5200, 13.4050] },
    'BR': { name: 'ブラジル', color: '#8bff4b', flag: '🇧🇷', center: [-15.7975, -47.8919] },
    'IN': { name: 'インド', color: '#ff4b8b', flag: '🇮🇳', center: [28.6139, 77.2090] },
    'RU': { name: 'ロシア', color: '#8b4bff', flag: '🇷🇺', center: [55.7558, 37.6173] },
    'AU': { name: 'オーストラリア', color: '#ffaa00', flag: '🇦🇺', center: [-33.8688, 151.2093] },
    'CA': { name: 'カナダ', color: '#00ffaa', flag: '🇨🇦', center: [45.4215, -75.6972] }
};

// マップ初期化
function initMap() {
    try {
        // Leafletマップの作成
        map = L.map('map', {
            center: [35.6762, 139.6503], // 東京
            zoom: 5,
            minZoom: 2,
            maxZoom: 10,
            worldCopyJump: true
        });

        // OpenStreetMapタイルレイヤー
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // レイヤーグループの初期化
        territoryMarkers = L.layerGroup().addTo(map);
        gridLayer = L.layerGroup();
        heatmapLayer = L.layerGroup();

        // マップクリックイベント
        map.on('click', function(e) {
            if (canPlace) {
                placeTerritory(e.latlng.lat, e.latlng.lng);
            }
        });

        // マップ移動時のグリッド更新
        map.on('moveend', function() {
            if (showGrid) {
                updateGrid();
            }
        });

        console.log('Map initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing map:', error);
        showNotification('地図の初期化に失敗しました', 'error');
        return false;
    }
}

// グリッド座標を取得
function getGridCoord(lat, lng) {
    return {
        lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
        lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE
    };
}

// 座標キーを生成
function getCoordKey(lat, lng) {
    const grid = getGridCoord(lat, lng);
    return `${grid.lat.toFixed(1)},${grid.lng.toFixed(1)}`;
}

// 領土マーカーを作成
function createTerritoryMarker(lat, lng, country) {
    const grid = getGridCoord(lat, lng);
    const bounds = [
        [grid.lat, grid.lng],
        [grid.lat + GRID_SIZE, grid.lng + GRID_SIZE]
    ];

    const rectangle = L.rectangle(bounds, {
        color: countryData[country].color,
        fillColor: countryData[country].color,
        fillOpacity: 0.4,
        weight: 2
    });

    // クリックイベント
    rectangle.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        if (canPlace) {
            placeTerritory(grid.lat + GRID_SIZE/2, grid.lng + GRID_SIZE/2);
        }
    });

    // ホバーイベント
    rectangle.on('mouseover', function() {
        this.setStyle({ fillOpacity: 0.6 });
    });

    rectangle.on('mouseout', function() {
        this.setStyle({ fillOpacity: 0.4 });
    });

    return rectangle;
}

// 領土を配置
function placeTerritory(lat, lng) {
    if (!canPlace) return;

    const coordKey = getCoordKey(lat, lng);
    const oldCountry = territories.get(coordKey);
    
    // 同じ国の領土には配置しない
    if (oldCountry === currentCountry) {
        showNotification('既に自国の領土です！', 'warning');
        return;
    }
    
    // 領土を更新
    territories.set(coordKey, currentCountry);
    
    // マーカーを再描画
    redrawTerritories();

    // エフェクト
    const grid = getGridCoord(lat, lng);
    const popup = L.popup()
        .setLatLng([grid.lat + GRID_SIZE/2, grid.lng + GRID_SIZE/2])
        .setContent(`<b>${countryData[currentCountry].flag} ${countryData[currentCountry].name}</b>が領土を獲得！`)
        .openOn(map);
    
    setTimeout(() => map.closePopup(popup), 3000);

    // 各種処理
    startCooldown();
    updateStats();
    addActivity(currentCountry, coordKey, oldCountry);
    updateLeaderboard();
    
    // 通知
    if (oldCountry && oldCountry !== currentCountry) {
        showNotification(`${countryData[oldCountry].name}から領土を奪取！`, 'success');
    }
    
    // AIプレイヤー
    setTimeout(() => simulateAIPlayers(), Math.random() * 3000 + 1000);
}

// 領土を再描画
function redrawTerritories() {
    territoryMarkers.clearLayers();
    territories.forEach((country, key) => {
        const [lat, lng] = key.split(',').map(Number);
        createTerritoryMarker(lat, lng, country).addTo(territoryMarkers);
    });
}

// クールダウン処理
function startCooldown() {
    canPlace = false;
    const cooldownBar = document.getElementById('cooldownBar');
    const cooldownFill = document.getElementById('cooldownFill');
    const cooldownTime = document.getElementById('cooldownTime');
    
    cooldownBar.classList.add('active');
    
    let timeLeft = COOLDOWN_TIME;
    const interval = setInterval(() => {
        timeLeft -= 100;
        const progress = (COOLDOWN_TIME - timeLeft) / COOLDOWN_TIME * 100;
        cooldownFill.style.width = progress + '%';
        cooldownTime.textContent = Math.ceil(timeLeft / 1000) + 's';
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            cooldownBar.classList.remove('active');
            canPlace = true;
        }
    }, 100);
}

// 統計更新
function updateStats() {
    const totalTerritories = territories.size;
    const myTerritories = Array.from(territories.values()).filter(c => c === currentCountry).length;
    
    document.getElementById('totalTerritories').textContent = totalTerritories;
    document.getElementById('myTerritories').textContent = myTerritories;
    document.getElementById('onlineUsers').textContent = Math.floor(Math.random() * 500) + 200;
    
    // 占領率
    const maxTerritories = 1000; // 仮想的な最大領土数
    const occupancyRate = Math.round(totalTerritories / maxTerritories * 100);
    document.getElementById('occupancyRate').textContent = `${occupancyRate}%`;
}

// リーダーボード更新
function updateLeaderboard() {
    const counts = {};
    territories.forEach(country => {
        counts[country] = (counts[country] || 0) + 1;
    });
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const leaderboardList = document.getElementById('leaderboardList');
    
    leaderboardList.innerHTML = sorted.slice(0, 5).map((entry, index) => {
        const [country, count] = entry;
        const data = countryData[country];
        const rankClass = index < 3 ? `rank-${index + 1}` : '';
        return `
            <div class="leaderboard-item">
                <span class="rank ${rankClass}">${index + 1}</span>
                <span class="country-info">
                    <span>${data.flag}</span>
                    <span>${data.name}</span>
                </span>
                <span class="territory-count">${count}</span>
            </div>
        `;
    }).join('');
}

// アクティビティ追加
function addActivity(country, coordKey, oldCountry) {
    const activityList = document.getElementById('activityList');
    const data = countryData[country];
    const time = new Date().toLocaleTimeString();
    
    let message = `${data.flag} ${data.name}が新領土を獲得`;
    if (oldCountry && oldCountry !== country) {
        message = `${data.flag} が ${countryData[oldCountry].flag}から領土を奪取！`;
    }
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.style.borderLeftColor = data.color;
    activityItem.innerHTML = `
        <div style="font-weight: bold;">${message}</div>
        <div style="opacity: 0.6; font-size: 12px;">📍 ${coordKey} | ${time}</div>
    `;
    
    activityList.insertBefore(activityItem, activityList.firstChild);
    
    while (activityList.children.length > 5) {
        activityList.removeChild(activityList.lastChild);
    }
}

// AIプレイヤーのシミュレーション
function simulateAIPlayers() {
    const aiCountries = Object.keys(countryData).filter(c => c !== currentCountry);
    const aiCountry = aiCountries[Math.floor(Math.random() * aiCountries.length)];
    
    // ランダムな位置または既存領土の近く
    let lat, lng;
    if (Math.random() < 0.7 && territories.size > 0) {
        // 既存領土の近くに配置（70%の確率）
        const existingTerritories = Array.from(territories.entries())
            .filter(([key, country]) => country === aiCountry);
        
        if (existingTerritories.length > 0) {
            const [baseKey] = existingTerritories[Math.floor(Math.random() * existingTerritories.length)];
            const [baseLat, baseLng] = baseKey.split(',').map(Number);
            lat = baseLat + (Math.random() - 0.5) * GRID_SIZE * 4;
            lng = baseLng + (Math.random() - 0.5) * GRID_SIZE * 4;
        } else {
            // AIの国の中心付近
            const center = countryData[aiCountry].center;
            lat = center[0] + (Math.random() - 0.5) * 10;
            lng = center[1] + (Math.random() - 0.5) * 10;
        }
    } else {
        // 完全にランダムな位置
        lat = (Math.random() * 140) - 70;
        lng = (Math.random() * 360) - 180;
    }
    
    const coordKey = getCoordKey(lat, lng);
    const oldCountry = territories.get(coordKey);
    
    // AIが領土を配置
    territories.set(coordKey, aiCountry);
    redrawTerritories();
    
    addActivity(aiCountry, coordKey, oldCountry);
    updateLeaderboard();
    updateStats();
}

// グリッド表示切り替え
function toggleGrid() {
    showGrid = !showGrid;
    if (showGrid) {
        updateGrid();
        gridLayer.addTo(map);
    } else {
        gridLayer.remove();
    }
}

// グリッド更新
function updateGrid() {
    gridLayer.clearLayers();
    const bounds = map.getBounds();
    
    for (let lat = Math.floor(bounds.getSouth()); lat <= Math.ceil(bounds.getNorth()); lat += GRID_SIZE) {
        for (let lng = Math.floor(bounds.getWest()); lng <= Math.ceil(bounds.getEast()); lng += GRID_SIZE) {
            L.rectangle([
                [lat, lng],
                [lat + GRID_SIZE, lng + GRID_SIZE]
            ], {
                color: 'rgba(255, 255, 255, 0.2)',
                weight: 1,
                fill: false,
                interactive: false
            }).addTo(gridLayer);
        }
    }
}

// ヒートマップ表示切り替え
function toggleHeatmap() {
    showHeatmap = !showHeatmap;
    showNotification(showHeatmap ? 'ヒートマップ表示ON' : 'ヒートマップ表示OFF', 'info');
    
    if (showHeatmap) {
        updateHeatmap();
        heatmapLayer.addTo(map);
    } else {
        heatmapLayer.remove();
    }
}

// ヒートマップ更新
function updateHeatmap() {
    heatmapLayer.clearLayers();
    
    // 領土密度を計算
    const density = new Map();
    territories.forEach((country, key) => {
        const [lat, lng] = key.split(',').map(Number);
        const regionKey = `${Math.floor(lat/5)*5},${Math.floor(lng/5)*5}`;
        density.set(regionKey, (density.get(regionKey) || 0) + 1);
    });
    
    // ヒートマップレイヤーを作成
    density.forEach((count, key) => {
        const [lat, lng] = key.split(',').map(Number);
        const opacity = Math.min(count * 0.1, 0.8);
        
        L.rectangle([
            [lat, lng],
            [lat + 5, lng + 5]
        ], {
            color: '#ff0000',
            fillColor: '#ff0000',
            fillOpacity: opacity,
            weight: 0,
            interactive: false
        }).addTo(heatmapLayer);
    });
}

// 自国の中心へ移動
function centerOnMyCountry() {
    const center = countryData[currentCountry].center;
    map.flyTo(center, 6, {
        animate: true,
        duration: 1.5
    });
}

// ビューをリセット
function resetView() {
    map.setView([35.6762, 139.6503], 5);
    showNotification('ビューをリセットしました', 'info');
}

// 通知表示
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification show';
    
    // タイプに応じて色を変更
    const colors = {
        success: 'linear-gradient(135deg, rgba(74, 222, 128, 0.9) 0%, rgba(34, 197, 94, 0.9) 100%)',
        error: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(185, 28, 28, 0.9) 100%)',
        warning: 'linear-gradient(135deg, rgba(251, 191, 36, 0.9) 0%, rgba(217, 119, 6, 0.9) 100%)',
        info: 'linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(29, 78, 216, 0.9) 100%)'
    };
    
    notification.style.background = colors[type] || colors.info;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 初期データの生成
function initializeGame() {
    // ランダムな初期領土を配置
    for (let i = 0; i < INITIAL_TERRITORIES; i++) {
        const countries = Object.keys(countryData);
        const country = countries[Math.floor(Math.random() * countries.length)];
        const center = countryData[country].center;
        
        // 各国の中心付近に初期領土を配置
        const lat = center[0] + (Math.random() - 0.5) * 20;
        const lng = center[1] + (Math.random() - 0.5) * 20;
        
        const coordKey = getCoordKey(lat, lng);
        territories.set(coordKey, country);
    }
    
    // 初期描画
    redrawTerritories();
    updateStats();
    updateLeaderboard();
    
    // ホットスポット更新
    updateHotspot();
}

// ホットスポット更新
function updateHotspot() {
    const hotspots = ['東京', 'ニューヨーク', 'ロンドン', 'パリ', '北京', 'モスクワ', 'シドニー', 'サンパウロ'];
    const hotspot = hotspots[Math.floor(Math.random() * hotspots.length)];
    document.getElementById('hotspot').textContent = hotspot;
}

// DOMContentLoaded イベント
document.addEventListener('DOMContentLoaded', function() {
    // マップを初期化
    if (initMap()) {
        // ゲームを初期化
        initializeGame();
        
        // 国選択の変更イベント
        document.getElementById('countrySelect').addEventListener('change', (e) => {
            currentCountry = e.target.value;
            updateStats();
            showNotification(`${countryData[currentCountry].flag} ${countryData[currentCountry].name}に変更しました`, 'info');
        });
        
        // 定期的なAI活動
        setInterval(() => {
            if (Math.random() > 0.3) {
                simulateAIPlayers();
            }
        }, 5000);
        
        // オンラインユーザー数の更新
        setInterval(() => {
            document.getElementById('onlineUsers').textContent = Math.floor(Math.random() * 500) + 200;
        }, 10000);
        
        // ホットスポットの更新
        setInterval(updateHotspot, 15000);
        
        // 初期メッセージ
        showNotification('ゲームを開始しました！地図をクリックして領土を配置してください', 'success');
    }
});

// グローバル関数（HTMLから呼び出し用）
window.toggleGrid = toggleGrid;
window.toggleHeatmap = toggleHeatmap;
window.centerOnMyCountry = centerOnMyCountry;
window.resetView = resetView;
