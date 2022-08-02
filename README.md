To use this template create a new repository and select `example-pkg` from the template dropdown.
Make sure to name your repository following `<name>-pkg` convention.
If you're interested in automated dependency updates make sure that `renovate` has access to the new repository.

# Things to do change when you use this repository as a template:
- [x] replace `example-pkg` with the name of your package in this `README`
- [x] update the `@smg-automotive/example` with the name of your package in `package.json`
- [x] update `repository` and `homepage` sections in `package.json` to point to your GitHub repository
- [ ] ensure that branch protection rules are applied to the `main` branch (Settings > Branches)
  - [x] Require a pull request before merging
  - [x] Require approvals
  - [ ] Require status checks to pass before merging (project needs to be built in circle for the checks to show up)
  - [x] Require linear history
  - [x] Include administrators
- [x] enable `dependabot` for security updates (Settings > Code security and analysis)
- [x] ensure that Frontend team has the admin access to the repository (Settings > Collaborators and teams)
- [x] ensure that the Bots team has write access to the repository (this is needed to release the package)
- [ ] provide usage examples in the `README.md`
- [ ] enable the project on circleci.com to build and test your package
- [x] change the circleci status badge in this `README` to the new project
- [ ] develop an awesome package
- [ ] live long and prosper
# next-page-bundlesize-pkg

[![CircleCI](https://circleci.com/gh/smg-automotive/next-page-bundlesize-pkg/tree/main.svg?style=svg&circle-token=c183f151fea3c74453cf8dd962d31e115906a300)](https://circleci.com/gh/smg-automotive/next-page-bundlesize-pkg/tree/main)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Usage
```
npm install @smg-automotive/next-page-bundlesize
```

## Development
```
npm run build
```

You can link your local npm package to integrate it with any local project:
```
cd smg-automotive-next-page-bundlesize-pkg
npm run build

cd <project directory>
npm link ../smg-automotive-next-page-bundlesize-pkg
```

## Release a new version

New versions are released on the ci using semantic-release as soon as you merge into master. Please
make sure your merge commit message adheres to the corresponding [conventions](https://www.conventionalcommits.org/en/v1.0.0/) and your branch name does not contain forward slashes `/`.
