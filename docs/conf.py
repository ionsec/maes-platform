# -- MAES Platform ReadTheDocs Configuration -------------------------------
project = "MAES Platform"
copyright = "2025, IONSEC.IO"
author = "IONSEC.IO Dev Team"

# -- General configuration ------------------------------------------------
extensions = [
    "sphinx_rtd_theme",
    "sphinxcontrib.mermaid",
    "sphinx_copybutton",
    "sphinx_tabs.tabs",
    "recommonmark",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
source_suffix = {
    ".rst": "restructuredtext",
    ".md": "markdown",
}

# -- Options for HTML output ----------------------------------------------
html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]
html_logo = "../MAES_Logo.png"
html_theme_options = {
    "logo_only": False,
    "display_version": True,
    "prev_next_buttons_location": "bottom",
    "style_external_links": False,
    "style_nav_header_background": "#1a237e",
    "navigation_depth": 4,
    "includehidden": True,
    "titles_only": False,
}
html_context = {
    "display_github": True,
    "github_user": "ionsec",
    "github_repo": "maes-platform",
    "github_version": "main",
    "conf_py_path": "/docs/",
}

# -- Mermaid configuration -------------------------------------------------
mermaid_version = "10.6.1"

# -- Copy-button configuration --------------------------------------------
copybutton_prompt_text = r">>> |\.\.\. |\$ |In \[\d*\]: |#\s"
copybutton_prompt_is_regexp = True
