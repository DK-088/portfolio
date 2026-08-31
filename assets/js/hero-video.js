document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('hero-video');
    const canvas = document.getElementById('hero-canvas');

    if (!video || !canvas) return;

    let animFrameId = null;
    let isPlaying = false;

    // Try WebGL rendering first for best performance
    let gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true }) ||
             canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true });

    if (gl) {
        initWebGL(gl);
    } else {
        initCanvas2D(canvas);
    }

    // WebGL Implementation
    function initWebGL(gl) {
        const vsSource = `
            attribute vec2 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
                vTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            
            void main() {
                vec4 color = texture2D(uTexture, vTexCoord);
                
                // Green screen difference logic
                float maxRB = max(color.r, color.b);
                float greenDiff = color.g - maxRB;
                
                // Sensitivity parameters for chroma keying
                float threshold = 0.12; 
                float softness = 0.12;  
                
                float alpha = 1.0 - smoothstep(threshold, threshold + softness, greenDiff);
                
                // Spill suppression: eliminate green halo on character edges
                if (color.g > maxRB) {
                    color.g = maxRB + (color.g - maxRB) * (1.0 - alpha);
                }
                
                gl_FragColor = vec4(color.rgb * alpha, alpha);
            }
        `;

        function createShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vertShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return;
        }

        gl.useProgram(program);

        // Quad setup
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1.0, -1.0,  0.0, 0.0,
             1.0, -1.0,  1.0, 0.0,
            -1.0,  1.0,  0.0, 1.0,
            -1.0,  1.0,  0.0, 1.0,
             1.0, -1.0,  1.0, 0.0,
             1.0,  1.0,  1.0, 1.0,
        ]), gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(program, 'aPosition');
        const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');

        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

        // Texture setup
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Blending setup
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        function renderWebGL() {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                }

                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                
                gl.clearColor(0.0, 0.0, 0.0, 0.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }

            if (isPlaying) {
                animFrameId = requestAnimationFrame(renderWebGL);
            }
        }

        window.startHeroVideoRender = () => {
            if (!isPlaying) {
                isPlaying = true;
                renderWebGL();
            }
        };

        window.stopHeroVideoRender = () => {
            isPlaying = false;
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        };
    }

    // 2D Canvas Fallback Implementation
    function initCanvas2D(canvas) {
        const ctx = canvas.getContext('2d');

        function renderCanvas2D() {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const l = frame.data.length / 4;

                for (let i = 0; i < l; i++) {
                    const r = frame.data[i * 4 + 0];
                    const g = frame.data[i * 4 + 1];
                    const b = frame.data[i * 4 + 2];

                    const maxRB = Math.max(r, b);
                    const greenDiff = g - maxRB;

                    if (greenDiff > 30) {
                        const alpha = Math.max(0, 1 - (greenDiff - 30) / 40);
                        frame.data[i * 4 + 3] = alpha * 255;
                        if (g > maxRB) {
                            frame.data[i * 4 + 1] = maxRB;
                        }
                    }
                }

                ctx.putImageData(frame, 0, 0);
            }

            if (isPlaying) {
                animFrameId = requestAnimationFrame(renderCanvas2D);
            }
        }

        window.startHeroVideoRender = () => {
            if (!isPlaying) {
                isPlaying = true;
                renderCanvas2D();
            }
        };

        window.stopHeroVideoRender = () => {
            isPlaying = false;
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        };
    }

    // Autoplay & Visibility Observer Handling
    function playVideo() {
        video.play().then(() => {
            if (window.startHeroVideoRender) window.startHeroVideoRender();
        }).catch(err => {
            console.log('Hero video autoplay blocked or deferred:', err);
            // Retry play on first user interaction
            const handleUserInteraction = () => {
                video.play().then(() => {
                    if (window.startHeroVideoRender) window.startHeroVideoRender();
                });
                document.removeEventListener('click', handleUserInteraction);
                document.removeEventListener('touchstart', handleUserInteraction);
            };
            document.addEventListener('click', handleUserInteraction);
            document.addEventListener('touchstart', handleUserInteraction);
        });
    }

    // IntersectionObserver to conserve resources when out of view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                playVideo();
            } else {
                video.pause();
                if (window.stopHeroVideoRender) window.stopHeroVideoRender();
            }
        });
    }, { threshold: 0.1 });

    observer.observe(document.getElementById('home'));

    // Additional event listener when video is loaded
    video.addEventListener('canplay', () => {
        playVideo();
    });
});
