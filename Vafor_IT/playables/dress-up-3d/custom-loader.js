(function () {
    'use strict';

    var overlay = null;
    var fill = null;
    var progressBarFillingInterval = null;
    var progressBarCompleteFillingStarted = false;

    function createOverlay() {
        if (overlay) return;
        if (!document.body) return;

        overlay = document.createElement('div');
        overlay.className = 'custom-loader';

        var icon = document.createElement('img');
        icon.className = 'custom-loader__icon';
        icon.src = './icon.png';
        icon.alt = 'Loading';

        var bar = document.createElement('div');
        bar.className = 'custom-loader__bar';

        fill = document.createElement('div');
        fill.className = 'custom-loader__fill';
        bar.appendChild(fill);

        overlay.appendChild(icon);
        overlay.appendChild(bar);
        document.body.appendChild(overlay);
    }

    function setProgress(percent) {
        if (!fill) return;
        fill.style.width = percent + '%';
    }

    function completeProgressBarFilling() {
        if (progressBarFillingInterval !== null) return;

        var currentPercent = 90;
        setProgress(currentPercent);
        progressBarFillingInterval = setInterval(function () {
            currentPercent++;
            if (currentPercent > 100) currentPercent = 100;
            setProgress(currentPercent);

            if (currentPercent >= 100) {
                clearInterval(progressBarFillingInterval);
                progressBarFillingInterval = null;
            }
        }, 100);
    }

    function onProgress(progress) {
        if (!fill) return;

        if (progress >= 1) {
            if (progressBarFillingInterval !== null) {
                clearInterval(progressBarFillingInterval);
                progressBarFillingInterval = null;
            }
            setProgress(100);
            return;
        }

        if (progressBarCompleteFillingStarted) return;

        if (progress >= 0.9) {
            progressBarCompleteFillingStarted = true;
            completeProgressBarFilling();
            return;
        }

        setProgress(Math.floor(progress * 100));
    }

    function hide() {
        if (!overlay) return;
        overlay.classList.add('hidden');
        setTimeout(function () {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            overlay = null;
            fill = null;
        }, 400);
    }

    function init() {
        createOverlay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.customLoader = {
        onProgress: onProgress,
        hide: hide
    };
})();
