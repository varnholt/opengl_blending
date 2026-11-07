/* Three.js constants are referenced by name so dropdown values cannot drift. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const factors = [
    ["ZeroFactor", "Zero", "GL_ZERO", "0"],
    ["OneFactor", "One", "GL_ONE", "1"],
    ["SrcColorFactor", "Source color", "GL_SRC_COLOR", "S"],
    [
      "OneMinusSrcColorFactor",
      "1 − source color",
      "GL_ONE_MINUS_SRC_COLOR",
      "(1 − S)",
    ],
    ["SrcAlphaFactor", "Source alpha", "GL_SRC_ALPHA", "Sα"],
    [
      "OneMinusSrcAlphaFactor",
      "1 − source alpha",
      "GL_ONE_MINUS_SRC_ALPHA",
      "(1 − Sα)",
    ],
    ["DstAlphaFactor", "Destination alpha", "GL_DST_ALPHA", "Dα"],
    [
      "OneMinusDstAlphaFactor",
      "1 − destination alpha",
      "GL_ONE_MINUS_DST_ALPHA",
      "(1 − Dα)",
    ],
    ["DstColorFactor", "Destination color", "GL_DST_COLOR", "D"],
    [
      "OneMinusDstColorFactor",
      "1 − destination color",
      "GL_ONE_MINUS_DST_COLOR",
      "(1 − D)",
    ],
    [
      "SrcAlphaSaturateFactor",
      "Source alpha saturate",
      "GL_SRC_ALPHA_SATURATE",
      "min(Sα, 1 − Dα)",
    ],
  ];
  const presets = {
    normal: [
      "SrcAlphaFactor",
      "OneMinusSrcAlphaFactor",
      "Source alpha blends the foreground into the background.",
    ],
    additive: [
      "SrcAlphaFactor",
      "OneFactor",
      "Add the source to the destination. Useful for light and glow.",
    ],
    multiply: [
      "ZeroFactor",
      "SrcColorFactor",
      "Multiply the colors together. Dark pixels darken the result.",
    ],
    subtractive: [
      "ZeroFactor",
      "OneMinusSrcColorFactor",
      "Darken the destination by the inverse source color.",
    ],
    replace: [
      "OneFactor",
      "ZeroFactor",
      "Write the source directly, including its alpha. Opacity does not reveal the destination.",
    ],
    custom: [
      "SrcAlphaFactor",
      "OneMinusSrcAlphaFactor",
      "Your factors, your equation. Experiment with the controls below.",
    ],
  };
  for (const id of ["source-factor", "destination-factor"]) {
    for (const [name, label] of factors) {
      if (id === "destination-factor" && name === "SrcAlphaSaturateFactor")
        continue;
      $(id).add(new Option(label, name));
    }
  }
  let renderer, scene, camera, geometry, sourceMaterial, destinationMaterial;
  let layers = {},
    requests = { source: 0, destination: 0 };
  let contextLost = false;
  const notify = (message) => {
    $("message").textContent = message;
  };
  function render() {
    if (renderer && layers.source && layers.destination && !contextLost)
      renderer.render(scene, camera);
  }
  function resize() {
    if (!renderer) return;
    const width = $("result").clientWidth,
      height = $("result").clientHeight;
    const aspect = width / height;
    camera.left = -aspect * 1.15;
    camera.right = aspect * 1.15;
    camera.top = 1.15;
    camera.bottom = -1.15;
    if (aspect < 1) {
      camera.left = -1.15;
      camera.right = 1.15;
      camera.top = 1.15 / aspect;
      camera.bottom = -1.15 / aspect;
    }
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    render();
  }
  function update() {
    const preset = $("preset").value,
      src = $("source-factor").value,
      dst = $("destination-factor").value;
    const equation = $("equation").value;
    const extremum = equation === "MinEquation" || equation === "MaxEquation";
    const replacing = preset === "replace";
    for (const id of ["source-factor", "destination-factor"])
      $(id).disabled = extremum || replacing;
    $("equation").disabled = replacing;
    $("factor-help").textContent = extremum
      ? "Minimum and maximum ignore blend factors."
      : replacing
        ? "Replace writes the source directly. Select another preset to blend."
        : "Adjust a factor to create your own blend.";
    $("preset-description").textContent = presets[preset][2];
    $("result-preset").textContent = $("preset").selectedOptions[0].textContent;
    $("opacity-value").textContent = `${$("opacity").value}%`;
    $("background-value").textContent = $("background").value.toUpperCase();
    const alphaSrc = preset === "normal" ? "OneFactor" : src;
    const alphaDst = dst;
    const glFactor = (key) => factors.find((f) => f[0] === key)[2];
    const symbol = (key) => factors.find((f) => f[0] === key)[3];
    const glEquation = {
      AddEquation: "GL_FUNC_ADD",
      SubtractEquation: "GL_FUNC_SUBTRACT",
      ReverseSubtractEquation: "GL_FUNC_REVERSE_SUBTRACT",
      MinEquation: "GL_MIN",
      MaxEquation: "GL_MAX",
    }[equation];
    const s = `S × ${symbol(src)}`,
      d = `D × ${symbol(dst)}`;
    $("formula").textContent = replacing
      ? "RGB = S"
      : extremum
        ? `RGB = ${equation === "MinEquation" ? "min" : "max"}(S, D)`
        : `RGB = ${equation === "ReverseSubtractEquation" ? `${d} − ${s}` : `${s} ${equation === "SubtractEquation" ? "−" : "+"} ${d}`}`;
    $("equation-note").textContent =
      `S = source color, D = destination color, α = alpha. Source alpha is multiplied by opacity (${$("opacity").value}%). RGB values are clamped to [0, 1].`;
    const opacity = (Number($("opacity").value) / 100).toFixed(2);
    $("code").textContent =
      `// Draw destination with blending disabled first.\n// Source fragment shader: color.a *= ${opacity};\n` +
      (replacing
        ? "glDisable(GL_BLEND);"
        : `glEnable(GL_BLEND);\nglBlendEquationSeparate(${glEquation}, ${glEquation});\nglBlendFuncSeparate(\n  ${glFactor(src)}, ${glFactor(dst)}, // RGB\n  ${glFactor(alphaSrc)}, ${glFactor(alphaDst)}  // alpha\n);`);
    if (renderer) {
      sourceMaterial.blending = replacing
        ? THREE.NoBlending
        : THREE.CustomBlending;
      sourceMaterial.blendSrc = THREE[src];
      sourceMaterial.blendDst = THREE[dst];
      sourceMaterial.blendSrcAlpha = THREE[alphaSrc];
      sourceMaterial.blendDstAlpha = THREE[alphaDst];
      sourceMaterial.blendEquation = THREE[equation];
      sourceMaterial.blendEquationAlpha = THREE[equation];
      sourceMaterial.opacity = Number(opacity);
      renderer.setClearColor($("background").value, 1);
      $("result").style.backgroundColor = $("background").value;
      render();
    }
  }
  function applyPreset() {
    const [src, dst] = presets[$("preset").value];
    $("source-factor").value = src;
    $("destination-factor").value = dst;
    $("equation").value = "AddEquation";
    update();
  }
  function showLayer(role) {
    const layer = layers[role];
    $(role + "-preview").src = layer.url;
    $(role + "-name").textContent = layer.name;
    $(role + "-name").title = layer.name;
    const material = role === "source" ? sourceMaterial : destinationMaterial;
    material.map = layer.texture;
    material.needsUpdate = true;
  }
  async function loadLayer(role, url, name, owned = false) {
    const request = ++requests[role];
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (request !== requests[role]) {
        if (owned) URL.revokeObjectURL(url);
        return;
      }
      const texture = new THREE.Texture(image);
      texture.needsUpdate = true;
      const previous = layers[role];
      layers[role] = { texture, url, name, owned };
      showLayer(role);
      if (previous) {
        previous.texture.dispose();
        if (previous.owned) URL.revokeObjectURL(previous.url);
      }
      if (layers.source && layers.destination) {
        $("render-status").hidden = true;
        $("download").disabled = contextLost;
        render();
      }
      if (owned)
        notify(
          `${role === "source" ? "Source" : "Destination"} texture updated. Files stay on your device.`,
        );
    } catch (error) {
      if (owned) URL.revokeObjectURL(url);
      if (request !== requests[role]) return;
      notify(
        `Could not read ${name}. Please choose a valid PNG, JPEG, or WebP image.`,
      );
      if (!layers[role])
        $("render-status").textContent =
          "A default texture could not load. Serve the project over HTTP and reload.";
    }
  }
  $("preset").addEventListener("change", applyPreset);
  for (const id of ["source-factor", "destination-factor", "equation"])
    $(id).addEventListener("change", () => {
      $("preset").value = "custom";
      update();
    });
  for (const id of ["opacity", "background"])
    $(id).addEventListener("input", update);
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("code").textContent);
      notify("OpenGL code copied.");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($("code"));
      selection.removeAllRanges();
      selection.addRange(range);
      notify("Code selected. Press Ctrl+C (or ⌘C) to copy.");
    }
  });
  applyPreset();
  try {
    if (!window.THREE)
      throw new Error("The local Three.js dependency could not load.");
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    geometry = new THREE.PlaneGeometry(2, 2);
    destinationMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    sourceMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: false,
    });
    const destination = new THREE.Mesh(geometry, destinationMaterial),
      source = new THREE.Mesh(geometry, sourceMaterial);
    destination.renderOrder = 0;
    source.renderOrder = 1;
    scene.add(destination, source);
    $("result").appendChild(renderer.domElement);
    const gl = renderer.getContext();
    if (
      !renderer.capabilities.isWebGL2 &&
      !gl.getExtension("EXT_blend_minmax")
    ) {
      for (const option of $("equation").options)
        if (["MinEquation", "MaxEquation"].includes(option.value))
          option.disabled = true;
    }
    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      contextLost = true;
      $("download").disabled = true;
      $("render-status").hidden = false;
      $("render-status").textContent =
        "Graphics context lost. Waiting for your browser to restore it…";
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      contextLost = false;
      $("render-status").hidden = true;
      $("download").disabled = !(layers.source && layers.destination);
      update();
    });
    new ResizeObserver(resize).observe($("result"));
    resize();
    update();
    loadLayer("source", "resources/2.png", "Texture 2 · default");
    loadLayer("destination", "resources/1.png", "Texture 1 · default");
    for (const role of ["source", "destination"])
      $(role + "-file").addEventListener("change", (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          notify("Please choose a PNG, JPEG, or WebP image.");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          notify("Please choose an image smaller than 20 MB.");
          return;
        }
        loadLayer(role, URL.createObjectURL(file), file.name, true);
      });
    $("swap").addEventListener("click", () => {
      if (!layers.source || !layers.destination) return;
      requests.source++;
      requests.destination++;
      [layers.source, layers.destination] = [layers.destination, layers.source];
      showLayer("source");
      showLayer("destination");
      render();
      notify("Source and destination swapped.");
    });
    $("reset").addEventListener("click", () => {
      $("preset").value = "normal";
      $("opacity").value = "100";
      $("background").value = "#202830";
      applyPreset();
      loadLayer("source", "resources/2.png", "Texture 2 · default");
      loadLayer("destination", "resources/1.png", "Texture 1 · default");
      notify("Default settings and textures restored.");
    });
    $("download").addEventListener("click", () => {
      render();
      renderer.domElement.toBlob((blob) => {
        if (!blob) {
          notify("Could not export the preview. Please try again.");
          return;
        }
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `blend-${$("preset").value}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        notify("Blended preview saved as PNG.");
      }, "image/png");
    });
  } catch (error) {
    $("render-status").textContent =
      "Preview unavailable. Enable WebGL / hardware acceleration in your browser, then reload. " +
      error.message;
    notify("The equation and code explorer remain available.");
  }
})();
