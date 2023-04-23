import * as Path from "path";

import type { Converter } from "../converter";
import type { Context } from "../context";
import {
    BindOption,
    Component,
    EntryPointStrategy,
    readFile,
} from "../../utils";
import {
    deriveRootDir,
    discoverInParentDir,
    discoverPackageJson,
} from "../../utils/fs";
import { nicePath } from "../../utils/paths";
import { MinimalSourceFile } from "../../utils/minimalSourceFile";
import type { ProjectReflection } from "../../models/index";
import { ApplicationEvents } from "../../application-events";
import { join } from "path";
import { ConverterEvents } from "../converter-events";

/**
 * A handler that tries to find the package.json and readme.md files of the
 * current project.
 */
export class PackagePlugin extends Component<Converter> {
    @BindOption("readme")
    readme!: string;

    @BindOption("entryPointStrategy")
    entryPointStrategy!: EntryPointStrategy;

    @BindOption("entryPoints")
    entryPoints!: string[];

    @BindOption("includeVersion")
    includeVersion!: boolean;

    /**
     * The file name of the found readme.md file.
     */
    private readmeFile?: string;

    /**
     * Contents of the readme.md file discovered, if any
     */
    private readmeContents?: string;

    /**
     * Contents of package.json for the active project
     */
    private packageJson?: { name: string; version?: string };

    constructor(converter: Converter) {
        super(converter);
        converter.on(ConverterEvents.BEGIN, this.onBegin.bind(this));
        converter.on(
            ConverterEvents.RESOLVE_BEGIN,
            this.onBeginResolve.bind(this)
        );
        converter.on(ConverterEvents.END, () => {
            delete this.readmeFile;
            delete this.readmeContents;
            delete this.packageJson;
        });
        this.application.on(ApplicationEvents.REVIVE, this.onRevive.bind(this));
    }

    private onRevive(project: ProjectReflection) {
        this.onBegin();
        this.addEntries(project);
        delete this.readmeFile;
        delete this.packageJson;
        delete this.readmeContents;
    }

    private onBegin() {
        this.readmeFile = undefined;
        this.readmeContents = undefined;
        this.packageJson = undefined;

        const entryFiles =
            this.entryPointStrategy === EntryPointStrategy.Packages
                ? this.entryPoints.map((d) => join(d, "package.json"))
                : this.entryPoints;

        const dirName = Path.resolve(deriveRootDir(entryFiles));

        this.application.logger.verbose(
            `Begin readme.md/package.json search at ${nicePath(dirName)}`
        );

        this.packageJson = discoverPackageJson(dirName)?.content;

        // Path will be resolved already. This is kind of ugly, but...
        if (this.readme.endsWith("none")) {
            return; // No readme, we're done
        }

        if (this.readme) {
            // Readme path provided, read only that file.
            try {
                this.readmeContents = readFile(this.readme);
                this.readmeFile = this.readme;
            } catch {
                this.application.logger.error(
                    `Provided README path, ${nicePath(
                        this.readme
                    )} could not be read.`
                );
            }
        } else {
            // No readme provided, automatically find the readme
            const result = discoverInParentDir(
                "readme.md",
                dirName,
                (content) => content
            );

            if (result) {
                this.readmeFile = result.file;
                this.readmeContents = result.content;
            }
        }
    }

    private onBeginResolve(context: Context) {
        this.addEntries(context.project);
    }

    private addEntries(project: ProjectReflection) {
        if (this.readmeFile && this.readmeContents) {
            const comment = this.application.converter.parseRawComment(
                new MinimalSourceFile(this.readmeContents, this.readmeFile)
            );

            if (comment.blockTags.length || comment.modifierTags.size) {
                const ignored = [
                    ...comment.blockTags.map((tag) => tag.tag),
                    ...comment.modifierTags,
                ];
                this.application.logger.warn(
                    `Block and modifier tags will be ignored within the readme:\n\t${ignored.join(
                        "\n\t"
                    )}`
                );
            }

            project.readme = comment.summary;
        }

        if (this.packageJson) {
            project.packageName = this.packageJson.name;
            if (!project.name) {
                project.name = project.packageName || "Documentation";
            }
            if (this.includeVersion) {
                project.packageVersion = this.packageJson.version?.replace(
                    /^v/,
                    ""
                );
            }
        } else if (!project.name) {
            this.application.logger.warn(
                'The --name option was not specified, and no package.json was found. Defaulting project name to "Documentation".'
            );
            project.name = "Documentation";
        }
    }
}
