import { RendererEvent } from "../events";
import { copySync, writeFileSync } from "../../utils/fs";
import { DefaultTheme } from "../themes/default/DefaultTheme";
import { getStyles } from "../../utils/highlighter";
import { Component, BindOption } from "../../utils";
import { existsSync } from "fs";
import { join } from "path";
import type { Renderer } from "..";

/**
 * A plugin that copies the subdirectory ´assets´ from the current themes
 * source folder to the output directory.
 */
export class AssetsPlugin extends Component<Renderer> {
    /** @internal */
    @BindOption("customCss")
    customCss!: string;

    /**
     * Create a new AssetsPlugin instance.
     */
    constructor(renderer: Renderer) {
        super(renderer);

        renderer.on(RendererEvent.END, this.onRenderEnd);
        renderer.on(RendererEvent.BEGIN, (event: RendererEvent) => {
            const dest = join(event.outputDirectory, "assets");

            if (this.customCss) {
                if (existsSync(this.customCss)) {
                    copySync(this.customCss, join(dest, "custom.css"));
                } else {
                    this.application.logger.error(
                        `Custom CSS file at ${this.customCss} does not exist.`
                    );
                }
            }
        });
    }

    /**
     * Triggered before the renderer starts rendering a project.
     *
     * @param event  An event object describing the current render operation.
     */
    private onRenderEnd(event: RendererEvent) {
        if (this.owner.theme instanceof DefaultTheme) {
            const src = join(__dirname, "..", "..", "..", "..", "static");
            const dest = join(event.outputDirectory, "assets");
            copySync(src, dest);

            writeFileSync(join(dest, "highlight.css"), getStyles());
        }
    }
}
