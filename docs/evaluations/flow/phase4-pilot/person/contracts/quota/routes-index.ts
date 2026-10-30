import { Module } from '@Architecture/Application';
import { FastifyPluginCallback } from 'fastify';

/** The routes of Plans, under `/plans`; none until its first feature. */
export const planRoutes: FastifyPluginCallback<{ plansModule: Module }> = (_fastify, _options, done) => done();
