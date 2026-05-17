var loadingProgress = 0.0;
var simulatedProgressRange = 0.65; // 0.65 ~ 65%
var simulationSteps = 100;
var simulationTime = 15; //seconds

var displayProgress = function(value) {
    var bar = document.getElementById('loaderBar');
    var loadingText = document.getElementById('loadingText');

    if(bar) bar.style.width = value * 100 + '%';
    if(loadingText) loadingText.innerHTML = Math.round(value * 100) + '%';
    if(typeof famobi !== 'undefined') famobi.setPreloadProgress(Math.floor(value * 99));
};

var stopPreloaderSimulation = function () {
    clearInterval(simulatingInterval);
};

var simulatingInterval = setInterval(() => {
    if(loadingProgress >= simulatedProgressRange) {
        return stopPreloaderSimulation();
    }
    loadingProgress += simulatedProgressRange / simulationSteps * Math.random();
    displayProgress(loadingProgress);
}, simulationTime / simulationSteps * 1000);

/* If real preload never advances, creep progress then dismiss splash */
var stallTicks = 0;
var stallBuster = setInterval(function () {
    if (loadingProgress >= simulatedProgressRange - 0.01) {
        loadingProgress = Math.min(0.99, loadingProgress + 0.02);
        displayProgress(loadingProgress);
        stallTicks++;
    }
    if (stallTicks >= 2 && loadingProgress >= 0.98) {
        clearInterval(stallBuster);
        displayProgress(1);
        var splash = document.getElementById('application-splash-wrapper');
        if (splash && splash.parentElement) splash.parentElement.removeChild(splash);
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'airtel:loaded' }, '*');
            }
        } catch (e) {}
        try {
            var embedded = false;
            try {
                embedded = window.parent && window.parent !== window;
            } catch (e) {}
            if (!embedded && typeof famobi !== 'undefined' && famobi.requestAction) {
                famobi.requestAction('startGame');
            }
        } catch (e) {}
    }
}, 2500);