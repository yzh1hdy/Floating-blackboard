/*! tailwindcss v3.4.0 | MIT License | https://tailwindcss.com */
(function(){
    const styles = document.createElement('style');
    styles.textContent = `
        *,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
        ::before,::after{--tw-content:''}
        html,:host{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";font-feature-settings:normal;font-variation-settings:normal;-webkit-tap-highlight-color:transparent}
        body{margin:0;line-height:inherit}
        .fixed{position:fixed}
        .absolute{position:absolute}
        .relative{position:relative}
        .inset-0{inset:0px}
        .bottom-3{bottom:0.75rem}
        .right-3{right:0.75rem}
        .bottom-4{bottom:1rem}
        .left-1\/2{left:50%}
        .z-50{z-index:50}
        .z-\[100\]{z-index:100}
        .z-\[1001\]{z-index:1001}
        .flex{display:flex}
        .hidden{display:none}
        .h-full{height:100%}
        .h-\[28px\]{height:28px}
        .h-\[56px\]{height:56px}
        .w-full{width:100%}
        .w-\[28px\]{width:28px}
        .w-\[64px\]{width:64px}
        .w-12{width:3rem}
        .max-w-xs{max-width:20rem}
        .-translate-x-1\/2{--tw-translate-x:-50%;transform:translate(var(--tw-translate-x),var(--tw-translate-y))rotate(var(--tw-rotate))skewX(var(--tw-skew-x))skewY(var(--tw-skew-y))scaleX(var(--tw-scale-x))scaleY(var(--tw-scale-y))}
        .translate-x-\[-50\%\]{--tw-translate-x:-50%;transform:translate(var(--tw-translate-x),var(--tw-translate-y))rotate(var(--tw-rotate))skewX(var(--tw-skew-x))skewY(var(--tw-skew-y))scaleX(var(--tw-scale-x))scaleY(var(--tw-scale-y))}
        .transform{transform:translate(var(--tw-translate-x),var(--tw-translate-y))rotate(var(--tw-rotate))skewX(var(--tw-skew-x))skewY(var(--tw-skew-y))scaleX(var(--tw-scale-x))scaleY(var(--tw-scale-y))}
        .cursor-pointer{cursor:pointer}
        .cursor-crosshair{cursor:crosshair}
        .select-none{-webkit-user-select:none;user-select:none}
        .flex-col{flex-direction:column}
        .items-center{align-items:center}
        .justify-center{justify-content:center}
        .gap-0{gap:0px}
        .gap-1{gap:0.25rem}
        .gap-2{gap:0.5rem}
        .gap-3{gap:0.75rem}
        .rounded-lg{border-radius:0.5rem}
        .rounded-2xl{border-radius:1rem}
        .rounded-\[6px\]{border-radius:6px}
        .rounded-full{border-radius:9999px}
        .border{border-width:1px}
        .border-2{border-width:2px}
        .border-white\/20{border-color:rgba(255,255,255,0.2)}
        .border-white\/10{border-color:rgba(255,255,255,0.1)}
        .bg-\[\#0f261e\]{--tw-bg-opacity:1;background-color:rgb(15 38 30/var(--tw-bg-opacity))}
        .bg-\[\#1a4236\]{--tw-bg-opacity:1;background-color:rgb(26 66 54/var(--tw-bg-opacity))}
        .bg-black\/60{background-color:rgba(0,0,0,0.6)}
        .bg-red-600\/80{background-color:rgba(220,38,38,0.8)}
        .bg-white\/10{background-color:rgba(255,255,255,0.1)}
        .p-6{padding:1.5rem}
        .px-4{padding-left:1rem;padding-right:1rem}
        .py-1\.5{padding-top:0.375rem;padding-bottom:0.375rem}
        .text-center{text-align:center}
        .font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
        .text-sm{font-size:0.875rem;line-height:1.25rem}
        .text-lg{font-size:1.125rem;line-height:1.75rem}
        .font-bold{font-weight:700}
        .text-white{--tw-text-opacity:1;color:rgb(255 255 255/var(--tw-text-opacity))}
        .text-gray-200{--tw-text-opacity:1;color:rgb(229 231 235/var(--tw-text-opacity))}
        .text-gray-300{--text-opacity:1;color:rgb(209 213 219/var(--text-opacity))}
        .text-white\/50{color:rgba(255,255,255,0.5)}
        .text-white\/60{color:rgba(255,255,255,0.6)}
        .text-white\/70{color:rgba(255,255,255,0.7)}
        .text-white\/90{color:rgba(255,255,255,0.9)}
        .opacity-15{opacity:0.15}
        .shadow-2xl{--tw-shadow:0 25px 50px -12px rgba(0,0,0,0.25);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}
        .backdrop-blur-sm{--tw-backdrop-blur:blur(4px);-webkit-backdrop-filter:var(--tw-backdrop-blur)var(--tw-backdrop-brightness)var(--tw-backdrop-contrast)var(--tw-backdrop-grayscale)var(--tw-backdrop-hue-rotate)var(--tw-backdrop-invert)var(--tw-backdrop-opacity)var(--tw-backdrop-saturate)var(--tw-backdrop-sepia);backdrop-filter:var(--tw-backdrop-blur)var(--tw-backdrop-brightness)var(--tw-backdrop-contrast)var(--tw-backdrop-grayscale)var(--tw-backdrop-hue-rotate)var(--tw-backdrop-invert)var(--tw-backdrop-opacity)var(--tw-backdrop-saturate)var(--tw-backdrop-sepia)}
        .backdrop-blur-\[12px\]{--tw-backdrop-blur:blur(12px);-webkit-backdrop-filter:var(--tw-backdrop-blur)var(--tw-backdrop-brightness)var(--tw-backdrop-contrast)var(--tw-backdrop-grayscale)var(--tw-backdrop-hue-rotate)var(--tw-backdrop-invert)var(--tw-backdrop-opacity)var(--tw-backdrop-saturate)var(--tw-backdrop-sepia);backdrop-filter:var(--tw-backdrop-blur)var(--tw-backdrop-brightness)var(--tw-backdrop-contrast)var(--tw-backdrop-grayscale)var(--tw-backdrop-hue-rotate)var(--tw-backdrop-invert)var(--tw-backdrop-opacity)var(--tw-backdrop-saturate)var(--tw-backdrop-sepia)}
        .transition{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}
        .hover\:bg-white\/10:hover{background-color:rgba(255,255,255,0.1)}
        .hover\:bg-red-500:hover{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity))}
        .hover\:scale-110:hover{--tw-scale-x:1.1;--tw-scale-y:1.1;transform:translate(var(--tw-translate-x),var(--tw-translate-y))rotate(var(--tw-rotate))skewX(var(--tw-skew-x))skewY(var(--tw-skew-y))scaleX(var(--tw-scale-x))scaleY(var(--tw-scale-y))}
        .disabled\:cursor-default:disabled{cursor:default}
        .disabled\:opacity-15:disabled{opacity:0.15}
        @media (min-width: 640px){.sm\:px-6{padding-left:1.5rem;padding-right:1.5rem}}
        @media (min-width: 1024px){.lg\:px-8{padding-left:2rem;padding-right:2rem}}
    `;
    document.head.appendChild(styles);
})();