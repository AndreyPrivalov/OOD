# Workspaces

## Purpose

This document defines the business logic for shared workspaces in OOD.

## Role in the Product

A workspace is a named shared container for one work tree. It is the top-level unit users switch between when working with different contexts of work decomposition.

## Rules

- a workspace contains one tree of work items;
- all users in the first cleaned phase have equal access to all workspaces;
- there are no personal/private workspaces in this phase;
- a work item belongs to exactly one workspace;
- items cannot be moved across workspaces in this phase.

## Required Behavior

- the user can list existing workspaces;
- the user can open a workspace and see its tree;
- the user can create a workspace;
- the user can rename a workspace if this is later exposed in UI;
- a newly created workspace starts empty.

## Empty State

- an empty workspace is a valid state;
- the UI should clearly show that the tree is empty and invite creation of the first root item.

## Negative Scenarios

- opening a non-existent workspace;
- creating two workspaces with invalid payload;
- showing an empty tree when loading actually failed;
- allowing a work item to appear in more than one workspace.
